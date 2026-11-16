/** Small accessible controls built with Obsidian DOM helpers in the panel's owning document. */
import type { PlotState } from "./model";
import type { PlotTranslator } from "./lang";
import type { PlotTranslationKey } from "./lang/en";

export interface Controls {
  state: PlotState;
  t: PlotTranslator;
  changed: (rebuild?: boolean) => void;
}

/** Creates a compact responsive grid without a document-scoped stylesheet. */
export function grid(parent: HTMLElement): HTMLDivElement {
  const el = parent.createDiv();
  el.setCssStyles({ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "8px" });
  return el;
}

/** Creates an accessible labeled field. */
export function field(parent: HTMLElement, label: string): HTMLLabelElement {
  const el = parent.createEl("label");
  el.setCssStyles({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "0",
    fontSize: "var(--font-ui-small)",
  });
  el.createSpan({ text: label });
  return el;
}

/** Adds a finite numeric field, leaving invalid/empty input visible for error correction. */
export function numberField(
  parent: HTMLElement,
  key: keyof PlotState,
  label: string,
  controls: Controls,
): HTMLInputElement {
  const input = field(parent, label).createEl("input", { type: "number" });
  input.value = String(controls.state[key]);
  input.step = "any";
  input.dataset.key = key;
  input.setCssStyles({ width: "100%", minWidth: "0" });
  input.addEventListener("input", () => {
    Object.assign(controls.state, { [key]: input.value.trim() === "" ? NaN : Number(input.value) });
    controls.changed();
  });
  return input;
}

/** Adds a text field without interpreting user input as markup. */
export function textField(
  parent: HTMLElement,
  key: "xFormula" | "yFormula" | "title" | "xLabel" | "yLabel",
  label: string,
  controls: Controls,
): void {
  const input = field(parent, label).createEl("input", { type: "text" });
  input.value = controls.state[key];
  input.maxLength = key.includes("Formula") ? 600 : 120;
  input.dataset.key = key;
  input.setCssStyles({ width: "100%" });
  input.addEventListener("input", () => {
    controls.state[key] = input.value;
    controls.changed();
  });
}

/** Adds a checkbox with a wrapping touch target. */
export function toggle(
  parent: HTMLElement,
  key: "grid" | "legend" | "piTicks" | "shade",
  label: string,
  controls: Controls,
): void {
  const el = parent.createEl("label");
  el.setCssStyles({ display: "flex", alignItems: "center", gap: "8px", minHeight: "32px" });
  const input = el.createEl("input", { type: "checkbox" });
  input.checked = controls.state[key];
  input.dataset.key = key;
  el.createSpan({ text: label });
  input.addEventListener("change", () => {
    controls.state[key] = input.checked;
    controls.changed();
  });
}

/** Adds a full-width action. */
export function button(
  parent: HTMLElement,
  text: string,
  action: () => void,
  name: string,
): HTMLButtonElement {
  const el = parent.createEl("button", { text });
  el.type = "button";
  el.dataset.action = name;
  el.setCssStyles({ minHeight: "36px", whiteSpace: "normal" });
  el.addEventListener("click", action);
  return el;
}

/** Adds a translated selection, returning the control for further wiring. */
export function selectField(
  parent: HTMLElement,
  label: string,
  values: readonly string[],
  selected: string,
  t: PlotTranslator,
): HTMLSelectElement {
  const select = field(parent, label).createEl("select");
  select.setCssStyles({ width: "100%", minWidth: "0" });
  values.forEach((value) => {
    select.createEl("option", { value, text: t(value as PlotTranslationKey) });
  });
  select.value = selected;
  return select;
}

/** Adds linked sliders and numeric fields for the three shared formula parameters. */
export function parameterControls(parent: HTMLElement, controls: Controls): void {
  for (const key of ["a", "b", "c"] as const) {
    const row = grid(parent);
    const number = numberField(row, key, key, controls);
    const range = row.createEl("input", { type: "range", attr: { "aria-label": key } });
    range.min = "-10";
    range.max = "10";
    range.step = "0.05";
    range.value = String(controls.state[key]);
    range.dataset.parameter = key;
    range.setCssStyles({ width: "100%", alignSelf: "end", minHeight: "32px" });
    range.addEventListener("input", () => {
      controls.state[key] = Number(range.value);
      number.value = range.value;
      controls.changed();
    });
    number.addEventListener("input", () => {
      range.value = String(controls.state[key]);
    });
  }
}
