/** @file index.ts @overview Locale-aware translator factory for Excalidraw Canvas Chat. */
import { createTranslator, type TranslationCatalog, type Translator } from "../../../sharedUtils/i18n";
import { de } from "./de";
import { en, type CanvasChatTranslationKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";
const CATALOGS = { en, de, es, fr, ru, "zh-cn": zhCn } satisfies Record<string, TranslationCatalog<CanvasChatTranslationKey>>;
export type CanvasChatTranslator = Translator<CanvasChatTranslationKey>;
export function createCanvasChatTranslator(locale: string): CanvasChatTranslator { return createTranslator(locale, CATALOGS); }
