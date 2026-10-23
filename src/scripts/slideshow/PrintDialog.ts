/* eslint-disable max-lines-per-function -- The dialog owns its controls and cancellation together. */
import { loadPrintPreferences, savePrintPreferences, type PrintPreset } from "./printPreferences";
import { parsePrintRanges } from "./printRanges";
import type { SlideshowTranslator } from "./lang";
import type { SlideDeckChoices } from "./presentationPath";
import { getPresentationSourceLabels } from "./presentationSources";
import {
  validPrintDimensions,
  type HandoutLayout,
  type PrintMargin,
  type PrintTheme,
  type SlideshowPrintSettings,
} from "./printLayout";

/** Prompts for handouts, inclusion, and page framing before generating any SVGs. */
export function openSlideshowPrintDialog(
  ea: ExcalidrawAutomate,
  defaults: Pick<SlideshowPrintSettings, "width" | "height" | "sourceKey"> & {
    choices: SlideDeckChoices;
    viewportSize?: boolean;
  },
  t: SlideshowTranslator,
): Promise<SlideshowPrintSettings | null> {
  return new Promise((resolve) => {
    const preferences = loadPrintPreferences(ea, defaults.width, defaults.height);
    if (defaults.viewportSize) {
      preferences.width = defaults.width;
      preferences.height = defaults.height;
      preferences.preset = "custom";
    }
    const modal = new ea.FloatingModal(app);
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
      const row = new ea.obsidian.Setting(modal.contentEl).setName(label);
      row.controlEl.setCssStyles({ minWidth: "0", flexShrink: "1" });
      const input = row.controlEl.createEl("select", { attr: { "aria-label": label } });
      input.setCssStyles({ maxWidth: "100%" });
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
    layout.value = preferences.layout;
    const theme = select(t("printTheme"), [
      ["light", t("printThemeLight")],
      ["dark", t("printThemeDark")],
    ]);
    theme.value = ea.getExcalidrawAPI().getAppState().theme === "dark" ? "dark" : "light";
    let visibleOnly = preferences.visibleOnly;
    new ea.obsidian.Setting(modal.contentEl)
      .setName(t("printVisibleOnly"))
      .setDesc(t("printVisibleOnlyHint"))
      .addToggle((toggle) =>
        toggle.setValue(visibleOnly).onChange((value) => {
          visibleOnly = value;
        }),
      );
    const rangeRow = new ea.obsidian.Setting(modal.contentEl)
      .setName(t("printPageRanges"))
      .setDesc(t("printPageRangesHint"));
    const ranges = rangeRow.controlEl.createEl("input", {
      type: "text",
      value: preferences.pageRanges ?? "",
      attr: { "aria-label": t("printPageRanges"), placeholder: "1-3;5;9-" },
    });
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
    preset.value = preferences.preset;
    margin.value = preferences.margin;
    orientation.value = preferences.width >= preferences.height ? "landscape" : "portrait";
    const dimension = (label: string, value: number): HTMLInputElement => {
      const row = new ea.obsidian.Setting(modal.contentEl).setName(label);
      return row.controlEl.createEl("input", {
        type: "number",
        value: String(value),
        attr: { min: "320", max: "14400", step: "any", "aria-label": label },
      });
    };
    const width = dimension(t("printWidth"), preferences.width);
    const height = dimension(t("printHeight"), preferences.height);
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
        try {
          parsePrintRanges(ranges.value);
        } catch {
          error.setText(t("printInvalidPageRanges"));
          ranges.focus();
          return;
        }
        const result = {
          ...size,
          sourceKey: source.value as SlideshowPrintSettings["sourceKey"],
          layout: layout.value as HandoutLayout,
          visibleOnly,
          theme: theme.value as PrintTheme,
          pageRanges: ranges.value.trim(),
          margin: margin.value as PrintMargin,
        };
        void savePrintPreferences(ea, {
          layout: result.layout,
          visibleOnly,
          margin: result.margin,
          width: result.width,
          height: result.height,
          pageRanges: result.pageRanges,
          preset: preset.value as PrintPreset,
        })
          .then(() => finish(result))
          .catch((reason) => {
            console.error("Slideshow print preferences save failed", reason);
            error.setText(t("printPreferencesFailed"));
          });
      });
    modal.onClose = () => finish(null);
    modal.open();
  });
}
