import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { ExcaliAITranslationKey } from "./en";
/** Untranslated task prompts and advanced UI fall back to English. */
export const de: TranslationCatalog<ExcaliAITranslationKey> = {
  noView: "Öffne zuerst eine Excalidraw-Zeichnung.",
  requiresVersion:
    "Dieses Skript erfordert Excalidraw 2.29.2 oder neuer. Bitte aktualisiere das Plugin.",
  prompt: "Prompt",
  advancedSettings: "{value1} <span>Erweiterte Einstellungen</span>",
  systemPrompt: "System-Prompt",
  textModel2: "Textmodell",
  imageModel2: "Bildmodell",
  textMaxTokenOverride: "Tokenlimit für Text überschreiben",
  reasoningHelp: "Denkaufwand: {effort} (aus den Excalidraw-KI-Einstellungen).",
  reasoningDefault: "API-Standard",
};
