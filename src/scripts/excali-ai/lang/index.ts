import { createTranslator, type Translator } from "../../../sharedUtils/i18n";
import { en, type ExcaliAITranslationKey } from "./en";
import { de } from "./de";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";
/** Creates a script-local translator with English fallback. */
export function createExcaliAITranslator(locale: string): Translator<ExcaliAITranslationKey> {
  return createTranslator(locale, { en, de, es, fr, ru, "zh-cn": zhCn });
}
