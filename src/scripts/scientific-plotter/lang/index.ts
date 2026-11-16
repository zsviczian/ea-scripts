/** Script-scoped locale selection with English fallback. */
import { createTranslator, type Translator } from "../../../sharedUtils/i18n";
import { en, type PlotTranslationKey } from "./en";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";
export type PlotTranslator = Translator<PlotTranslationKey>;
/** Creates a translator using Obsidian's selected language. */
export function createPlotTranslator(locale: string): PlotTranslator {
  return createTranslator(locale, { en, de, es, fr, ru, "zh-cn": zhCn });
}
