/**
 * @file index.ts
 * @overview Locale registry for Deconstruct Selected Elements Into New Drawing.
 */

import {
  createTranslator,
  type TranslationCatalog,
  type Translator,
} from "../../../sharedUtils/i18n";
import { de } from "./de";
import { en, type DeconstructTranslationKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";

const CATALOGS = { en, de, es, fr, ru, "zh-cn": zhCn } satisfies Record<
  string,
  TranslationCatalog<DeconstructTranslationKey>
>;

export type DeconstructTranslator = Translator<DeconstructTranslationKey>;

/** Creates the script's locale-aware translator. */
export function createDeconstructTranslator(locale: string): DeconstructTranslator {
  return createTranslator(locale, CATALOGS);
}
