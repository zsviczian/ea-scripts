import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { ExcaliAITranslationKey } from "./en";
/** Untranslated task prompts and advanced UI fall back to English. */
export const es: TranslationCatalog<ExcaliAITranslationKey> = {
  noView: "Abre primero un dibujo de Excalidraw.",
  requiresVersion: "Este script requiere Excalidraw 2.29.3 o posterior. Actualiza el complemento.",
  prompt: "Instrucciones",
  advancedSettings: "{value1} <span>Ajustes avanzados</span>",
  systemPrompt: "Instrucciones del sistema",
  textModel2: "Modelo de texto",
  imageModel2: "Modelo de imagen",
  textMaxTokenOverride: "Límite de tokens de texto",
  reasoningHelp: "Esfuerzo de razonamiento: {effort} (de los ajustes de IA de Excalidraw).",
  reasoningDefault: "Predeterminado de la API",
};
