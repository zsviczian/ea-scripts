import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { MindmapTranslationKey } from "./en";

// English fallback until this catalog has maintained translations.
export const es = {
  NOTICE_MERMAID_COPIED: "Copiado como mapa mental de Mermaid.",
  NOTICE_MERMAID_INVALID:
    "No se puede pegar este mapa mental de Mermaid. Usa una sola raíz y sangra sus nodos hijos.",
  LABEL_COPY_MERMAID: "Mapa mental de Mermaid",
  DESC_COPY_MERMAID: "Copia la rama seleccionada y sus nodos hijos como bloque de código Mermaid.",
  BUTTON_COPY_MERMAID: "Copiar como Mermaid",
  MERMAID_EMPTY_NODE: "Nodo sin título",
} satisfies TranslationCatalog<MindmapTranslationKey>;
