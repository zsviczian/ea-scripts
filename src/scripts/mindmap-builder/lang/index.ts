import { createTranslator, type Translator } from "../../../sharedUtils/i18n";
import { de } from "./de";
import { en, type MindmapTranslationKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";
import { zhTw } from "./zh-tw";

export type MindmapTranslator = Translator<MindmapTranslationKey>;

/** Preserves the historical `zh` catalog alongside Obsidian's `zh-cn` locale. */
export function createMindmapTranslator(locale: string, isAppleDevice = false): MindmapTranslator {
  const translate = createTranslator(locale, {
    en,
    de,
    es,
    fr,
    ru,
    zh: zhCn,
    "zh-cn": zhCn,
    "zh-tw": zhTw,
  });
  return (key, params = {}) =>
    translate(key, { modifier: isAppleDevice ? "OPT" : "ALT", ...params });
}
