/* eslint-disable max-lines-per-function -- The dialog owns its controls and cancellation together. */
import type { SlideshowTranslator } from "./lang";
import type { SlideDeckChoices } from "./presentationPath";
import { getPresentationSourceLabels } from "./presentationSources";
import {
  validPrintDimensions,
  type HandoutLayout,
  type PrintMargin,
  type SlideshowPrintSettings,
} from "./printLayout";

/** Prompts for handouts, inclusion, and page framing before generating any SVGs. */
export function openSlideshowPrintDialog(
  ea: ExcalidrawAutomate,
  defaults: Pick<SlideshowPrintSettings, "width" | "height" | "sourceKey"> & {
    choices: SlideDeckChoices;
  },
  t: SlideshowTranslator,
): Promise<SlideshowPrintSettings | null> {
  return new Promise((resolve) => {
    const modal = new ea.obsidian.Modal(app);
    modal.titleEl.setText(t("printDialogTitle"));
    let settled = false;
    const finish = (result: SlideshowPrintSettings | null): void => {
      if (settled) return;
      settled = true;
      resolve(result);
      modal.close();
    };
    const select = (
      label: string,
      entries: readonly (readonly [string, string])[],
    ): HTMLSelectElement => {
      const row = modal.contentEl.createEl("label");
      row.createEl("p", { text: label });
      const input = row.createEl("select", { attr: { "aria-label": label } });
      for (const [value, text] of entries) input.createEl("option", { value, text });
      return input;
    };
    const source = select(
      t("printSlideshow"),
      getPresentationSourceLabels(
        defaults.choices,
        t("frameDeck"),
        t("linePresentationDefaultName"),
      ).map((item) => {
        const kind = item.key === "frame" ? t("frameDeck") : t("linePresentationDefaultName");
        return [item.key, item.label === kind ? kind : `${kind}: ${item.label}`] as const;
      }),
    );
    source.value = defaults.sourceKey;
    if (!source.value) source.selectedIndex = 0;
    const layout = select(t("printLayout"), [
      ["slides", t("printSlidesOnly")],
      ["notes", t("printNotesPage")],
      ["handout-2", t("printHandout2")],
      ["handout-3", t("printHandout3")],
    ]);
    const visibleLabel = modal.contentEl.createEl("label");
    const visible = visibleLabel.createEl("input", { type: "checkbox" });
    visible.checked = true;
    visibleLabel.createSpan({ text: t("printVisibleOnly") });
    const preset = select(t("printPageSize"), [
      ["configured", t("printConfigured")],
      ["A4", "A4"],
      ["Letter", "Letter"],
      ["16:9", "16:9"],
      ["custom", t("printCustom")],
    ]);
    const orientation = select(t("printOrientation"), [
      ["landscape", t("printLandscape")],
      ["portrait", t("printPortrait")],
    ]);
    const margin = select(t("printMargin"), [
      ["none", t("printMarginNone")],
      ["minimal", t("printMarginMinimal")],
      ["normal", t("printMarginNormal")],
    ]);
    orientation.value = defaults.width >= defaults.height ? "landscape" : "portrait";
    const dimension = (label: string, value: number): HTMLInputElement => {
      const row = modal.contentEl.createEl("label");
      row.createEl("p", { text: label });
      return row.createEl("input", {
        type: "number",
        value: String(value),
        attr: { min: "320", max: "14400", step: "any", "aria-label": label },
      });
    };
    const width = dimension(t("printWidth"), defaults.width);
    const height = dimension(t("printHeight"), defaults.height);
    const applyPreset = (): void => {
      let size = { width: Number(width.value), height: Number(height.value) };
      if (preset.value === "A4" || preset.value === "Letter") {
        size = ea.getPagePDFDimensions(preset.value, "landscape");
      } else if (preset.value === "16:9") size = { width: 1920, height: 1080 };
      else if (preset.value === "configured") size = defaults;
      const long = Math.max(size.width, size.height);
      const short = Math.min(size.width, size.height);
      width.value = String(orientation.value === "landscape" ? long : short);
      height.value = String(orientation.value === "landscape" ? short : long);
    };
    preset.addEventListener("change", applyPreset);
    orientation.addEventListener("change", applyPreset);
    for (const input of [width, height])
      input.addEventListener("input", () => {
        preset.value = "custom";
        orientation.value = Number(width.value) >= Number(height.value) ? "landscape" : "portrait";
      });
    modal.contentEl.createEl("p", { text: t("printNotesHint"), cls: "setting-item-description" });
    const error = modal.contentEl.createEl("p", { cls: "mod-warning", attr: { role: "alert" } });
    const actions = modal.contentEl.createDiv({ cls: "modal-button-container" });
    actions
      .createEl("button", { text: t("settingsCancel") })
      .addEventListener("click", () => finish(null));
    actions
      .createEl("button", { text: t("printDialogPrint"), cls: "mod-cta" })
      .addEventListener("click", () => {
        const size = { width: Number(width.value), height: Number(height.value) };
        if (!validPrintDimensions(size.width, size.height)) {
          error.setText(t("printInvalidDimensions"));
          return;
        }
        finish({
          ...size,
          sourceKey: source.value as SlideshowPrintSettings["sourceKey"],
          layout: layout.value as HandoutLayout,
          visibleOnly: visible.checked,
          margin: margin.value as PrintMargin,
        });
      });
    modal.onClose = () => finish(null);
    modal.open();
  });
}
