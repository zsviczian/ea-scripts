import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { MindmapTranslationKey } from "./en";

// English fallback until this catalog has maintained translations.
export const ru = {
  NOTICE_MERMAID_COPIED: "Скопировано как интеллект-карта Mermaid.",
  NOTICE_MERMAID_INVALID:
    "Не удалось вставить интеллект-карту Mermaid. Используйте один корень и отступы для дочерних узлов.",
  LABEL_COPY_MERMAID: "Интеллект-карта Mermaid",
  DESC_COPY_MERMAID: "Скопировать выбранную ветвь с дочерними узлами в блок кода Mermaid.",
  BUTTON_COPY_MERMAID: "Копировать как Mermaid",
  MERMAID_EMPTY_NODE: "Узел без названия",
} satisfies TranslationCatalog<MindmapTranslationKey>;
