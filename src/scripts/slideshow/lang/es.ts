import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { SlideshowTranslationKey } from "./en";

export const es = {
  requiresNewerVersion:
    "Este script requiere una versión más reciente de Excalidraw. Instala la última versión.",
  noActiveView: "Abre un dibujo de Excalidraw antes de iniciar la presentación.",
  cannotAccessView: "No se pudo acceder a la vista activa de Excalidraw.",
} satisfies TranslationCatalog<SlideshowTranslationKey>;
