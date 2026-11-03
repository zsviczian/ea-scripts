import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { MindmapTranslationKey } from "./en";

// English fallback until this catalog has maintained translations.
export const de = {
  NOTICE_MARKDOWN_IMAGE_INVALID: "Dieser Markdown-Bildanhang kann nicht importiert oder exportiert werden. Quellblöcke und Verweise prüfen.",
  NOTICE_MARKDOWN_IMAGE_MISSING: "Die Markdown-Bildquelle ist nicht verfügbar. Es wurde nichts kopiert oder ausgeschnitten.",
  NOTICE_MERMAID_COPIED: "Als Mermaid-Mindmap kopiert.",
  NOTICE_MERMAID_INVALID:
    "Diese Mermaid-Mindmap kann nicht eingefügt werden. Verwende eine Wurzel und rücke ihre Unterknoten ein.",
  LABEL_COPY_MERMAID: "Mermaid-Mindmap",
  DESC_COPY_MERMAID:
    "Den ausgewählten Zweig mit seinen Unterknoten als Mermaid-Codeblock kopieren.",
  BUTTON_COPY_MERMAID: "Als Mermaid kopieren",
  MERMAID_EMPTY_NODE: "Unbenannter Knoten",
} satisfies TranslationCatalog<MindmapTranslationKey>;
