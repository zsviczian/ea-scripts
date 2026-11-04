import {
  createTranslator,
  type Translator,
  type TranslationCatalog,
} from "../../../sharedUtils/i18n";
import { en, type WizardTranslationKey } from "./en";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";
export type WizardTranslator = Translator<WizardTranslationKey>;
/** Resolves script-local catalogs with English fallback. */
export function createWizardTranslator(locale: string): WizardTranslator {
  const catalogs: Record<string, TranslationCatalog<WizardTranslationKey>> = {
    en,
    de,
    es,
    fr,
    ru,
    "zh-cn": zhCn,
  };
  return createTranslator(locale, catalogs);
}
