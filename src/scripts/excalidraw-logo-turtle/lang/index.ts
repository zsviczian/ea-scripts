/**
 * @file index.ts
 * @overview Locale-aware translator factory for Excalidraw Logo Turtle.
 */

import {
  createTranslator,
  type TranslationCatalog,
  type Translator,
} from "../../../sharedUtils/i18n";
import { de } from "./de";
import { en, type LogoTurtleTranslationKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";

const CATALOGS = { en, de, es, fr, ru, "zh-cn": zhCn } satisfies Record<
  string,
  TranslationCatalog<LogoTurtleTranslationKey>
>;

export type LogoTurtleTranslator = Translator<LogoTurtleTranslationKey>;

/** Creates a Logo Turtle translator with English fallback. */
export function createLogoTurtleTranslator(locale: string): LogoTurtleTranslator {
  return createTranslator(locale, CATALOGS);
}
