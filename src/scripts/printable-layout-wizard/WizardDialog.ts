/* eslint-disable max-lines-per-function -- Controls share one dialog-local settings and operation lifetime. */
import type { App } from "obsidian";
import { adjacentPage, getFrames, nextPageName, type Direction, type PageFrame } from "./frames";
import type { WizardTranslator } from "./lang";
import { parsePageRanges } from "./pageRanges";
import { PagePreviewService } from "./PagePreviewService";
import { PagePreviewPanel } from "./PagePreviewPanel";
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
  const previews = new PagePreviewService(ea, api);
  let previewPanel: PagePreviewPanel | undefined;
  let helpOpen = false;
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
    const row = parent.createEl("label");
    row.setCssStyles({
      display: "flex",
      alignItems: "center",
      gap: "10px",
      minWidth: "0",
      flexWrap: "wrap",
    });
    const label = t(key === "size" ? "pageSize" : key);
    row.createSpan({ text: label });
    const dropdown = row.createEl("select", { cls: "dropdown", attr: { "aria-label": label } });
    dropdown.setCssStyles({ flex: "1 1 130px", width: "100%", minWidth: "0", height: "36px" });
    for (const entry of entries)
      dropdown.createEl("option", {
        value: entry,
        text:
          key === "size"
            ? entry
            : t(entry as "portrait" | "landscape" | "none" | "tiny" | "normal"),
      });
    dropdown.value = String(value(key));
    dropdown.addEventListener("change", () => {
      change(key, dropdown.value);
      if (key === "margin")
        previewPanel?.setMargin(MARGINS[dropdown.value as keyof typeof MARGINS] ?? 0);
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
          if (key === "empty") previewPanel?.setSelection(ranges, newValue);
        });
      });
  };
  const renderPrinting = (parent: HTMLElement): void => {
    select(parent, "margin", Object.keys(MARGINS));
    toggle(parent, "empty");
    const row = new ea.obsidian.Setting(parent).setName(t("pages")).setDesc(t("pagesHint"));
    row.settingEl.setCssStyles({ flexWrap: "wrap", gap: "12px" });
    row.infoEl.setCssStyles({ flex: "1 1 220px", minWidth: "0" });
    row.controlEl.setCssStyles({ flex: "1 1 160px", minWidth: "0" });
    let input: HTMLInputElement;
    row.addText((control) => {
      input = control.inputEl;
      input.setCssStyles({ width: "100%" });
      input.setAttribute("aria-label", t("pages"));
      control
        .setValue(ranges)
        .setPlaceholder("1, 3-5, 9-")
        .onChange((newValue) => {
          ranges = newValue;
          previewPanel?.setSelection(ranges, checked("empty"));
        });
    });
    const error = parent.createEl("p", { cls: "mod-warning", attr: { role: "alert" } });
    parent.createEl("h4", { text: t("preview") }).setCssStyles({ margin: "8px 0" });
    const gallery = parent.createDiv();
    const actions = modal.contentEl.createDiv({ cls: "printable-layout-actions" });
    actions.setCssStyles({
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "12px",
      flex: "0 0 auto",
      padding: "12px 10px 4px",
      borderTop: "1px solid var(--background-modifier-border)",
      backgroundColor: "var(--background-primary)",
    });
    const exportButton = button(actions, t("print"), () => {
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
    });
    exportButton.addClass("mod-cta");
    exportButton.setCssStyles({ height: "40px" });
    const count = actions.createSpan({ attr: { "aria-live": "polite", role: "status" } });
    const refresh = button(
      actions,
      t("refreshPreview"),
      () => {
        previews.clear();
        previewPanel?.refresh();
      },
      "refresh-cw",
    );
    refresh.setCssStyles({ marginLeft: "auto" });
    previewPanel = new PagePreviewPanel({
      host: gallery,
      ea,
      api,
      previews,
      markersOnly: checked("markers"),
      t,
      onSelection: (total, invalid) => {
        count.setText(t(total === 1 ? "printCountOne" : "printCount", { count: total }));
        error.setText(invalid ? t("invalidRange") : "");
        input.setAttribute("aria-invalid", String(invalid));
        exportButton.disabled = invalid || total === 0;
      },
    });
    previewPanel.setSelection(ranges, checked("empty"));
    previewPanel.setMargin(MARGINS[value("margin") as keyof typeof MARGINS] ?? 0);
  };
  const render = (): void => {
    previewPanel?.destroy();
    previewPanel = undefined;
    component.unload();
    component.load();
    modal.contentEl.empty();
    const content = modal.contentEl.createDiv({ cls: "printable-layout-content" });
    content.setCssStyles({
      display: "flex",
      flexDirection: "column",
      gap: "15px",
      padding: "10px",
      minHeight: "0",
      overflowY: "auto",
      flex: "1 1 auto",
    });
    const help = content.createEl("details");
    help.open = helpOpen;
    help.setCssStyles({ marginBottom: "10px" });
    help.addEventListener("toggle", () => {
      helpOpen = help.open;
    });
    help
      .createEl("summary", { text: t("help") })
      .setCssStyles({ cursor: "pointer", fontWeight: "bold", marginBottom: "10px" });
    const helpBody = help.createDiv();
    helpBody.setCssStyles({
      padding: "10px",
      border: "1px solid var(--background-modifier-border)",
      borderRadius: "4px",
      maxHeight: "300px",
      overflowY: "auto",
    });
    void ea.obsidian.MarkdownRenderer.render(
      app,
      t("helpText"),
      helpBody,
      file?.path ?? "",
      component,
    ).catch(report);
    const list = frames();
    const tabs = content.createDiv({ attr: { role: "tablist" } });
    tabs.setCssStyles({
      display: "flex",
      gap: "8px",
      borderBottom: "1px solid var(--background-modifier-border)",
    });
    if (list.length) {
      for (const name of ["frames", "printing"] as const) {
        const control = button(tabs, t(name), () => {
          tab = name;
          render();
        });
        control.setAttribute("role", "tab");
        control.setAttribute("aria-selected", String(tab === name));
        control.setCssStyles({
          padding: "8px 12px",
          height: "36px",
          border: "1px solid var(--background-modifier-border)",
          borderBottom: "none",
          borderRadius: "6px 6px 0 0",
          backgroundColor:
            tab === name ? "var(--background-secondary)" : "var(--background-primary)",
          color: "var(--text-normal)",
          marginBottom: "-1px",
          boxShadow: "none",
        });
      }
    } else {
      tab = "frames";
      tabs.remove();
    }
    const body = content.createDiv({ cls: "printable-layout-panel" });
    body.setCssStyles({
      padding: list.length ? "12px" : "0",
      border: list.length ? "1px solid var(--background-modifier-border)" : "none",
      borderRadius: "0 6px 6px 6px",
    });
    if (list.length) {
      body.setAttribute("role", "tabpanel");
      body.setAttribute("aria-label", t(tab));
    }
    if (tab === "printing") {
      renderPrinting(body);
      return;
    }
    if (!list.length) {
      const dimensions = body.createDiv({ cls: "printable-layout-dimensions" });
      dimensions.setCssStyles({
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
        gap: "10px",
        marginBottom: "10px",
      });
      select(dimensions, "size", PAGE_SIZES);
      select(dimensions, "orientation", ["portrait", "landscape"]);
    }
    for (const key of ["lock", "zoom", "close", "markers"] as const) toggle(body, key);
    if (!list.length) {
      const createFirstButton = button(body, t("createFirst"), () => {
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
      });
      createFirstButton.addClass("mod-cta");
      createFirstButton.setCssStyles({ width: "100%", height: "44px", marginTop: "10px" });
    } else {
      const grid = body.createDiv();
      grid.setCssStyles({
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gridAutoRows: "44px",
        gap: "10px",
        marginTop: "10px",
      });
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
        ).setCssStyles({
          gridColumn: column,
          gridRow: row,
          height: "100%",
          width: "100%",
          minWidth: "0",
          padding: "4px 8px",
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        });
      }
      const rotation = button(grid, t("rotate"), () => {
        rotate = !rotate;
        render();
      });
      rotation.setCssStyles({
        gridColumn: "2",
        gridRow: "2",
        height: "100%",
        width: "100%",
        minWidth: "0",
        padding: "4px 8px",
        alignSelf: "stretch",
        whiteSpace: "normal",
        lineHeight: "1.2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });
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
    previewPanel?.destroy();
    previews.clear();
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
  modal.titleEl.setCssStyles({ textAlign: "center" });
  modal.modalEl.addClass("printable-layout-wizard");
  modal.modalEl.setCssStyles({
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 32px)",
  });
  modal.contentEl.setCssStyles({
    display: "flex",
    flexDirection: "column",
    minHeight: "0",
    overflow: "hidden",
  });
  void persist().catch(report);
  render();
  modal.open();
}
