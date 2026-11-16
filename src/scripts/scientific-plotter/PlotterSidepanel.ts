/** Persistent multi-drawing plot authoring UI. Previewing never mutates the drawing. */
import type { PlotView, PlotTab } from "./types";
import { defaultState, applyPreset, readPlotState, type PlotState } from "./model";
import { PlotError } from "./expression";
import { buildDiagram, type Diagram } from "./diagram";
import { fitY } from "./sampling";
import { distributionNames } from "./distributions";
import { renderPreview, commitDiagram, findStoredPlot, type StoredPlot } from "./render";
import {
  grid,
  field,
  button,
  numberField,
  textField,
  toggle,
  selectField,
  parameterControls,
  type Controls,
} from "./controls";
import type { PlotTranslator } from "./lang";
import type { PlotTranslationKey } from "./lang/en";

const parameterLabels = {
  normal: ["mean", "sigma"],
  uniform: ["lowerBound", "upperBound"],
  exponential: ["rate"],
  lognormal: ["logMean", "logSigma"],
  logistic: ["location", "scale"],
  student: ["degrees"],
  binomial: ["trials", "chance"],
  poisson: ["poissonMean"],
} satisfies Record<string, PlotTranslationKey[]>;
const distributionDefaults = {
  normal: [0, 1],
  uniform: [0, 1],
  exponential: [1, 1],
  lognormal: [0, 0.5],
  logistic: [0, 1],
  student: [5, 1],
  binomial: [20, 0.5],
  poisson: [5, 1],
} as const;

/** Owns one panel, its serialized settings writes and non-overlapping drawing transactions. */
export class PlotterSidepanel {
  private state: PlotState;
  private loaded: StoredPlot | null = null;
  private diagram: Diagram | null = null;
  private preview!: SVGSVGElement;
  private status!: HTMLElement;
  private target!: HTMLElement;
  private insert!: HTMLButtonElement;
  private update!: HTMLButtonElement;
  private timer = 0;
  private saveTimer = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  private busy = false;
  private closed = false;
  private pendingView: PlotView | null | undefined;

  public constructor(
    private readonly ea: ExcalidrawAutomate,
    private readonly tab: PlotTab,
    private readonly t: PlotTranslator,
  ) {
    const settings = ea.getScriptSettings() as Record<string, unknown>;
    this.state = readPlotState(settings.scientificPlotter) ?? { ...defaultState };
  }

  /** Installs cleanup and explicit view binding, including restored panels with no drawing. */
  public initialize(): void {
    this.tab.onOpen = () => this.syncTarget();
    this.tab.onFocus = (view) => this.bind(view);
    this.tab.onExcalidrawViewClosed = () => this.bind(null);
    this.tab.onClose = () => this.dispose();
    this.ea.registerCleanup(() => this.dispose());
    this.build();
  }

  /** Defers EA rebinding until a pending save finishes using its original target. */
  private bind(view: PlotView | null): void {
    if (this.closed) return;
    if (this.busy) {
      this.pendingView = view;
      return;
    }
    if (view !== this.ea.targetView) this.loaded = null;
    this.ea.setView(view);
    this.syncTarget();
  }

  /** Removes pending work. DOM listeners belong only to the removed panel subtree. */
  private dispose(): void {
    if (this.closed) return;
    this.closed = true;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.saveTimer);
    this.tab.contentEl.replaceChildren();
  }

  /** Saves stable snapshots in order, preserving unrelated script settings. */
  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    if (!readPlotState(this.state)) return;
    const snapshot = { ...this.state };
    this.saveTimer = window.setTimeout(() => {
      this.saveQueue = this.saveQueue
        .then(async () => {
          if (!this.closed)
            await this.ea.setScriptSettings({
              ...this.ea.getScriptSettings(),
              scientificPlotter: snapshot,
            });
        })
        .catch((error: unknown) => {
          if (!this.closed) this.showError(error);
        });
    }, 450);
  }

  /** Refreshes only the preview while typing, preserving caret and slider drag state. */
  private changed(rebuild = false): void {
    this.scheduleSave();
    window.clearTimeout(this.timer);
    if (rebuild) this.build();
    else {
      this.diagram = null;
      this.syncTarget();
      this.timer = window.setTimeout(() => this.refreshPreview(), 80);
    }
  }

  /** Renders controls using the current mode and existing state. */
  private build(): void {
    const root = this.tab.contentEl;
    root.replaceChildren();
    root.dataset.scientificPlotter = "true";
    root.setCssStyles({
      padding: "12px",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      height: "100%",
      boxSizing: "border-box",
    });
    root.createEl("h3", { text: this.t("title") }).setCssStyles({ margin: "0" });
    root.createDiv({ text: this.t("subtitle"), cls: "setting-item-description" });
    const preset = selectField(
      root,
      this.t("starter"),
      ["trig", "polynomial", "damped", "piecewise", "lissajous", "rose", "normal", "binomial"],
      "",
      this.t,
    );
    preset.selectedIndex = -1;
    preset.dataset.key = "preset";
    preset.addEventListener("change", () => {
      this.state = applyPreset(this.state, preset.value);
      this.changed(true);
    });
    const mode = selectField(
      root,
      this.t("title"),
      ["functions", "parametric", "polar", "distribution"],
      this.state.mode,
      this.t,
    );
    mode.dataset.key = "mode";
    mode.addEventListener("change", () => {
      this.state.mode = mode.value as PlotState["mode"];
      this.changed(true);
    });
    const controls: Controls = {
      state: this.state,
      t: this.t,
      changed: (rebuild) => this.changed(rebuild),
    };
    if (this.state.mode === "distribution") this.buildDistribution(root, controls);
    else this.buildFormulas(root, controls);
    this.buildWindow(root, controls);
    this.preview = root.createSvg("svg", {
      attr: { role: "img", "aria-label": this.t("preview") },
    });
    this.preview.setCssStyles({
      width: "100%",
      height: "auto",
      backgroundColor: "#fff",
      borderRadius: "8px",
      flexShrink: "0",
    });
    this.status = root.createDiv({ attr: { role: "status", "aria-live": "polite" } });
    this.target = root.createDiv({ cls: "setting-item-description" });
    this.insert = button(
      root,
      this.t("insert"),
      () => {
        void this.draw(false);
      },
      "insert",
    );
    this.insert.classList.add("mod-cta");
    const row = grid(root);
    button(row, this.t("load"), () => this.loadSelected(), "load");
    this.update = button(
      row,
      this.t("update"),
      () => {
        void this.draw(true);
      },
      "update",
    );
    this.buildAppearance(root, controls);
    const help = root.createEl("details");
    help.createEl("summary", { text: this.t("details") });
    for (const key of ["formulaHelp", "functionsHelp", "samplingHint", "fitHint"] as const)
      help.createEl("p", { text: this.t(key), cls: "setting-item-description" });
    this.refreshPreview();
  }

  /** Adds function overlays or parametric/polar inputs and shared sliders. */
  private buildFormulas(root: HTMLElement, controls: Controls): void {
    if (this.state.mode === "functions") {
      const input = field(root, this.t("formulas")).createEl("textarea");
      input.value = this.state.formulas;
      input.rows = 3;
      input.maxLength = 3600;
      input.spellcheck = false;
      input.dataset.key = "formulas";
      input.setCssStyles({
        width: "100%",
        resize: "vertical",
        fontFamily: "var(--font-monospace)",
      });
      input.addEventListener("input", () => {
        this.state.formulas = input.value;
        this.changed();
      });
    } else {
      if (this.state.mode === "parametric")
        textField(root, "xFormula", this.t("xFormula"), controls);
      textField(
        root,
        "yFormula",
        this.t(this.state.mode === "polar" ? "rFormula" : "yFormula"),
        controls,
      );
      const row = grid(root);
      numberField(row, "tMin", this.t("tmin"), controls);
      numberField(row, "tMax", this.t("tmax"), controls);
    }
    const parameters = root.createEl("details");
    parameters.open = true;
    parameters.createEl("summary", { text: this.t("parameters") });
    parameterControls(parameters, controls);
  }

  /** Adds distribution parameters, density/CDF selection and interval highlighting. */
  private buildDistribution(root: HTMLElement, controls: Controls): void {
    const distribution = selectField(
      root,
      this.t("distribution"),
      distributionNames,
      this.state.distribution,
      this.t,
    );
    distribution.dataset.key = "distribution";
    distribution.addEventListener("change", () => {
      this.state.distribution = distribution.value as PlotState["distribution"];
      [this.state.p, this.state.q] = distributionDefaults[this.state.distribution];
      this.changed(true);
    });
    const row = grid(root);
    parameterLabels[this.state.distribution].forEach((key, index) =>
      numberField(row, index === 0 ? "p" : "q", this.t(key), controls),
    );
    const display = selectField(
      root,
      this.t("preview"),
      ["density", "cumulative"],
      this.state.cumulative ? "cumulative" : "density",
      this.t,
    );
    display.dataset.key = "cumulative";
    display.addEventListener("change", () => {
      this.state.cumulative = display.value === "cumulative";
      this.changed();
    });
    toggle(root, "shade", this.t("shade"), controls);
    const bounds = grid(root);
    numberField(bounds, "lower", this.t("lower"), controls);
    numberField(bounds, "upper", this.t("upper"), controls);
    root.createDiv({ text: this.t("cdfHint"), cls: "setting-item-description" });
  }

  /** Adds explicit bounds and a deliberate vertical fit action. */
  private buildWindow(root: HTMLElement, controls: Controls): void {
    const details = root.createEl("details");
    details.open = true;
    details.createEl("summary", { text: this.t("viewport") });
    const bounds = grid(details);
    for (const [key, label] of [
      ["xMin", "xmin"],
      ["xMax", "xmax"],
      ["yMin", "ymin"],
      ["yMax", "ymax"],
    ] as const)
      numberField(bounds, key, this.t(label), controls);
    button(
      details,
      this.t("fitY"),
      () => {
        try {
          this.state = fitY(this.state);
          this.changed(true);
        } catch (error) {
          this.showError(error);
        }
      },
      "fit",
    );
  }

  /** Adds labels and diagram appearance controls without rebuilding the active input on every keystroke. */
  private buildAppearance(root: HTMLElement, controls: Controls): void {
    const details = root.createEl("details");
    details.createEl("summary", { text: this.t("appearance") });
    textField(details, "title", this.t("diagramTitle"), controls);
    const row = grid(details);
    textField(row, "xLabel", this.t("xLabel"), controls);
    textField(row, "yLabel", this.t("yLabel"), controls);
    numberField(row, "width", this.t("width"), controls);
    numberField(row, "height", this.t("height"), controls);
    for (const key of ["grid", "legend", "piTicks"] as const)
      toggle(details, key, this.t(key), controls);
  }

  /** Computes one bounded preview, showing localized validation errors inline. */
  private refreshPreview(): void {
    if (this.closed) return;
    try {
      this.diagram = buildDiagram(this.state, this.t);
      renderPreview(this.preview, this.diagram);
      this.status.textContent = this.t("ready", { count: this.diagram.sampled.curves.length });
    } catch (error) {
      this.diagram = null;
      this.preview.replaceChildren();
      this.showError(error);
    }
    this.syncTarget();
  }

  /** Keeps actions bound to a valid drawing and a successfully validated plot. */
  private syncTarget(): void {
    if (!this.target || this.closed) return;
    this.target.textContent = this.ea.targetView
      ? this.t("target", { name: this.ea.targetView.file?.basename ?? "" })
      : this.t("noView");
    this.insert.disabled = this.busy || !this.ea.targetView || !this.diagram;
    this.update.disabled = this.insert.disabled || !this.loaded;
  }

  /** Restores a selected diagram's saved specification; no drawing mutation occurs. */
  private loadSelected(): void {
    if (this.busy || !this.ea.targetView) return;
    this.loaded = findStoredPlot(this.ea.getViewElements(), this.ea.getViewSelectedElements());
    if (!this.loaded) {
      this.status.textContent = this.t("selectPlot");
      this.syncTarget();
      return;
    }
    this.state = { ...this.loaded.state };
    this.changed(true);
    this.status.textContent = this.t("loaded");
  }

  /** Commits one immutable specification; view changes are applied only after the transaction settles. */
  private async draw(replace: boolean): Promise<void> {
    if (this.busy || this.closed || !this.ea.targetView) return;
    const state = { ...this.state };
    try {
      const diagram = buildDiagram(state, this.t);
      let previous: StoredPlot | null = null;
      if (replace) {
        const elements = this.ea.getViewElements();
        const anchor = elements.filter(
          (e) => !e.isDeleted && e.customData?.scientificPlotId === this.loaded?.plotId,
        );
        previous = findStoredPlot(elements, anchor);
        if (!previous) {
          this.status.textContent = this.t("missingPlot");
          return;
        }
      }
      this.busy = true;
      this.syncTarget();
      this.status.textContent = this.t("busy");
      const committed = await commitDiagram(this.ea, diagram, state, previous);
      if (!this.closed)
        this.status.textContent = this.t(committed ? (replace ? "updated" : "inserted") : "noView");
    } catch (error) {
      if (!this.closed) this.showError(error);
    } finally {
      this.busy = false;
      if (this.pendingView !== undefined) {
        const view = this.pendingView;
        this.pendingView = undefined;
        this.bind(view);
      }
      this.syncTarget();
    }
  }

  /** Presents parser/domain failures through script-local translation keys. */
  private showError(error: unknown): void {
    this.status.textContent =
      error instanceof PlotError
        ? this.t(error.key, { detail: error.detail })
        : this.t("error", { detail: error instanceof Error ? error.message : "" });
  }
}
