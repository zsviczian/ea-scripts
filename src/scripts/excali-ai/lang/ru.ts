import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { ExcaliAITranslationKey } from "./en";
/** Untranslated task prompts and advanced UI fall back to English. */
export const ru: TranslationCatalog<ExcaliAITranslationKey> = {
  noView: "Сначала откройте рисунок Excalidraw.",
  requiresVersion: "Для этого скрипта требуется Excalidraw 2.29.2 или новее. Обновите плагин.",
  prompt: "Запрос",
  advancedSettings: "{value1} <span>Дополнительные настройки</span>",
  systemPrompt: "Системный запрос",
  textModel2: "Текстовая модель",
  imageModel2: "Модель изображений",
  textMaxTokenOverride: "Лимит токенов текста",
  reasoningHelp: "Уровень рассуждения: {effort} (из настроек ИИ Excalidraw).",
  reasoningDefault: "По умолчанию в API",
};
