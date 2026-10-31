import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { MindmapTranslationKey } from "./en";

// English fallback until this catalog has maintained translations.
export const fr = {
  NOTICE_MERMAID_COPIED: "Copié sous forme de carte mentale Mermaid.",
  NOTICE_MERMAID_INVALID:
    "Impossible de coller cette carte mentale Mermaid. Utilisez une seule racine et indentez ses enfants.",
  LABEL_COPY_MERMAID: "Carte mentale Mermaid",
  DESC_COPY_MERMAID: "Copier la branche sélectionnée et ses enfants dans un bloc de code Mermaid.",
  BUTTON_COPY_MERMAID: "Copier en Mermaid",
  MERMAID_EMPTY_NODE: "Nœud sans titre",
} satisfies TranslationCatalog<MindmapTranslationKey>;
