/* eslint-disable max-lines-per-function -- Controls share one dialog-local settings and operation lifetime. */
import type { App } from "obsidian";
import { adjacentPage, getFrames, nextPageName, type Direction, type PageFrame } from "./frames";
import type { WizardTranslator } from "./lang";
import { parsePageRanges } from "./pageRanges";
import { printToPdf } from "./printToPdf";
import { KEYS, MARGINS, PAGE_SIZES, loadSettings, type Preference } from "./settings";

type Modal = InstanceType<ExcalidrawAutomate["FloatingModal"]>;
type RuntimeHost = App & {
  __printableLayoutWizard?: { modal: Modal; view: ExcalidrawAutomate["targetView"] };
};

/** Opens one view-bound wizard; repeated activation reuses that drawing's dialog. */
export function openWizard(ea: ExcalidrawAutomate, t: WizardTranslator): void {
  const host = app as RuntimeHost;
  const view = ea.targetView;
  if (host.__printableLayoutWizard?.view === view) {
    host.__printableLayoutWizard.modal.open();
    return;
  }
  host.__printableLayoutWizard?.modal.close();
  const file = view?.file;
  const api = ea.getExcalidrawAPI();
  const modal = new ea.FloatingModal(app);
  const settings = loadSettings(ea.getScriptSettings());
  const originalRendering = api.getAppState().frameRendering;
  let tab: "frames" | "printing" = "frames";
  let rotate = false;
  let busy = false;
  let closed = false;
  let ranges = "";
  let writer = Promise.resolve();
  const isCurrent = (): boolean =>
    !closed && ea.targetView === view && view?.file === file && ea.getExcalidrawAPI() === api;
  const value = (key: Preference): string | boolean => settings[KEYS[key]].value;
  const checked = (key: Preference): boolean => value(key) === true;
  const frames = (): PageFrame[] => getFrames(ea.getViewElements(), checked("markers"));
  const report = (reason: unknown): void => {
    console.error("Printable Layout Wizard", reason);
    new ea.obsidian.Notice(
      t(
        reason instanceof Error && reason.message === "PRINT_VIEW_CHANGED"
          ? "viewChanged"
          : "failed",
      ),
    );
  };
  const persist = (): Promise<void> => {
    const snapshot = structuredClone(settings);
    writer = writer.catch(report).then(() => ea.setScriptSettings(snapshot));
    return writer;
  };
  const change = (key: Preference, newValue: string | boolean): void => {
    settings[KEYS[key]].value = newValue;
    void persist().catch(report);
  };
  const operate = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    if (!isCurrent()) {
      new ea.obsidian.Notice(t("viewChanged"));
      return;
    }
    busy = true;
    try {
      await action();
    } catch (reason) {
      report(reason);
    } finally {
      busy = false;
      if (!closed) render();
    }
  };
  const addFrame = async (
    box: { x: number; y: number; width: number; height: number },
    first: boolean,
  ): Promise<void> => {
    ea.clear();
    try {
      const id = ea.addFrame(
        box.x,
        box.y,
        box.width,
        box.height,
        first ? "01" : nextPageName(frames()),
      );
      const element = ea.getElement(id);
      element.frameRole = "marker";
      element.locked = checked("lock");
      await ea.addElementsToView(first);
      if (!isCurrent()) return;
      const added = ea.getViewElements().find((el) => el.id === id);
      if (added) {
        if (checked("zoom")) ea.viewZoomToElements(true, [added]);
        else ea.selectElementsInView([added]);
      }
      rotate = false;
      if (checked("close")) modal.close();
    } finally {
      ea.clear();
    }
  };
  const addAdjacent = async (direction: Direction): Promise<void> => {
    const available = frames();
    const selected = ea.getViewSelectedElements();
    const locked = api.getAppState().activeLockedId;
    const frame =
      available.find((el) => selected.some((item) => item.id === el.id) || el.id === locked) ??
      available.at(-1);
    if (!frame) return;
    ea.viewUpdateScene({ appState: { activeLockedId: null } });
    await addFrame(adjacentPage(frame, direction, rotate), false);
  };
  const button = (
    parent: HTMLElement,
    label: string,
    action: () => void,
    icon?: string,
  ): HTMLButtonElement => {
    const result = parent.createEl("button", { text: label, attr: { "aria-label": label } });
    if (icon) {
      result.empty();
      const svg = ea.obsidian.getIcon(icon);
      if (svg) result.append(svg);
    }
    result.addEventListener("click", action);
    return result;
  };
  const select = (
    parent: HTMLElement,
    key: "size" | "orientation" | "margin",
    entries: readonly string[],
  ): void => {
    new ea.obsidian.Setting(parent)
      .setName(t(key === "size" ? "pageSize" : key))
      .addDropdown((dropdown) => {
        for (const entry of entries)
          dropdown.addOption(
            entry,
            key === "size"
              ? entry
              : t(entry as "portrait" | "landscape" | "none" | "tiny" | "normal"),
          );
        dropdown.setValue(String(value(key))).onChange((newValue) => change(key, newValue));
      });
  };
  const toggle = (
    parent: HTMLElement,
    key: "lock" | "zoom" | "close" | "markers" | "empty",
  ): void => {
    const label = key === "empty" ? "printEmpty" : key;
    const hint =
      key === "empty"
        ? "printEmptyHint"
        : (`${key}Hint` as "lockHint" | "zoomHint" | "closeHint" | "markersHint");
    new ea.obsidian.Setting(parent)
      .setName(t(label))
      .setDesc(t(hint))
      .addToggle((control) => {
        control.setValue(checked(key)).onChange((newValue) => {
          change(key, newValue);
          if (key === "markers") render();
        });
      });
  };
  const renderPrinting = (parent: HTMLElement): void => {
    select(parent, "margin", Object.keys(MARGINS));
    toggle(parent, "empty");
    const list = frames();
    parent.createEl("p", {
      text: t("pageList", {
        count: list.length,
        names: list.map((frame, i) => `${i + 1}: ${frame.name ?? ""}`).join(", "),
      }),
      cls: "setting-item-description",
    });
    const row = new ea.obsidian.Setting(parent).setName(t("pages")).setDesc(t("pagesHint"));
    let input: HTMLInputElement;
    row.addText((control) => {
      input = control.inputEl;
      input.setAttribute("aria-label", t("pages"));
      control
        .setValue(ranges)
        .setPlaceholder("1, 3-5, 9-")
        .onChange((newValue) => {
          ranges = newValue;
          error.setText("");
        });
    });
    const error = parent.createEl("p", { cls: "mod-warning", attr: { role: "alert" } });
    button(parent, t("print"), () => {
      try {
        parsePageRanges(ranges);
      } catch {
        error.setText(t("invalidRange"));
        input.focus();
        return;
      }
      void operate(() =>
        printToPdf(
          ea,
          {
            markersOnly: checked("markers"),
            printEmpty: checked("empty"),
            ranges,
            margin: value("margin") as keyof typeof MARGINS,
          },
          t,
        ),
      );
    }).addClass("mod-cta");
  };
  const render = (): void => {
    component.unload();
    component.load();
    modal.contentEl.empty();
    const content = modal.contentEl;
    const help = content.createEl("details");
    help.createEl("summary", { text: t("help") });
    void ea.obsidian.MarkdownRenderer.render(
      app,
      t("helpText"),
      help.createDiv(),
      file?.path ?? "",
      component,
    ).catch(report);
    const list = frames();
    const tabs = content.createDiv();
    if (list.length) {
      for (const name of ["frames", "printing"] as const) {
        const control = button(tabs, t(name), () => {
          tab = name;
          render();
        });
        control.setAttribute("aria-pressed", String(tab === name));
        if (tab === name) control.addClass("mod-cta");
      }
    } else tab = "frames";
    const body = content.createDiv();
    if (tab === "printing") {
      renderPrinting(body);
      return;
    }
    if (!list.length) {
      select(body, "size", PAGE_SIZES);
      select(body, "orientation", ["portrait", "landscape"]);
    }
    for (const key of ["lock", "zoom", "close", "markers"] as const) toggle(body, key);
    if (!list.length) {
      button(body, t("createFirst"), () => {
        void operate(async () => {
          const size = ea.getPagePDFDimensions(
            value("size") as Parameters<typeof ea.getPagePDFDimensions>[0],
            value("orientation") as "portrait" | "landscape",
          );
          const state = api.getAppState();
          await addFrame(
            { x: (state.width - size.width) / 2, y: (state.height - size.height) / 2, ...size },
            true,
          );
        });
      }).addClass("mod-cta");
    } else {
      const grid = body.createDiv();
      grid.setCssStyles({ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" });
      for (const [direction, column, row] of [
        ["up", "2", "1"],
        ["left", "1", "2"],
        ["right", "3", "2"],
        ["down", "2", "3"],
      ] as const) {
        button(
          grid,
          t(direction),
          () => {
            void operate(() => addAdjacent(direction));
          },
          `arrow-big-${direction}`,
        ).setCssStyles({ gridColumn: column, gridRow: row, minHeight: "40px" });
      }
      const rotation = button(grid, t("rotate"), () => {
        rotate = !rotate;
        render();
      });
      rotation.setCssStyles({ gridColumn: "2", gridRow: "2" });
      rotation.setAttribute("aria-pressed", String(rotate));
      if (rotate) rotation.addClass("mod-cta");
    }
  };
  const component = new ea.obsidian.Component();
  component.load();
  const unregister = ea.registerCleanup(() => modal.close());
  modal.onClose = () => {
    if (closed) return;
    closed = true;
    unregister();
    component.unload();
    if (host.__printableLayoutWizard?.modal === modal) delete host.__printableLayoutWizard;
    if (ea.targetView === view && view?.file === file && ea.getExcalidrawAPI() === api)
      ea.viewUpdateScene({ appState: { frameRendering: originalRendering } });
  };
  host.__printableLayoutWizard = { modal, view };
  ea.viewUpdateScene({
    appState: {
      frameRendering: {
        ...originalRendering,
        enabled: true,
        name: true,
        outline: true,
        markerEnabled: true,
        markerName: true,
      },
    },
  });
  modal.titleEl.setText(t("title"));
  void persist().catch(report);
  render();
  modal.open();
}
