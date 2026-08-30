import {
  createTranslator,
  type TranslationCatalog,
  type Translator,
} from "../../../sharedUtils/i18n";
import { de } from "./de";
import { en, type SlideshowTranslationKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";

const CATALOGS = { en, de, es, fr, ru, "zh-cn": zhCn } satisfies Record<
  string,
  TranslationCatalog<SlideshowTranslationKey>
>;

export type SlideshowTranslator = Translator<SlideshowTranslationKey>;

/** Creates the slideshow's locale-aware translator. */
export function createSlideshowTranslator(locale: string): SlideshowTranslator {
  return createTranslator(locale, CATALOGS);
}
