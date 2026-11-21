import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { ExcaliAITranslationKey } from "./en";
/** Untranslated task prompts and advanced UI fall back to English. */
export const zhCn: TranslationCatalog<ExcaliAITranslationKey> = {
  noView: "请先打开 Excalidraw 绘图。",
  requiresVersion: "此脚本需要 Excalidraw 2.29.3 或更新版本。请更新插件。",
  prompt: "提示词",
  advancedSettings: "{value1} <span>高级设置</span>",
  systemPrompt: "系统提示词",
  textModel2: "文本模型",
  imageModel2: "图像模型",
  textMaxTokenOverride: "覆盖文本令牌上限",
  reasoningHelp: "推理强度：{effort}（来自 Excalidraw AI 设置）。",
  reasoningDefault: "API 默认值",
};
