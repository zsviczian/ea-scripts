import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { SlideshowTranslationKey } from "./en";

export const fr = {
  requiresNewerVersion:
    "Ce script nécessite une version plus récente d’Excalidraw. Installez la dernière version.",
  noActiveView: "Ouvrez un dessin Excalidraw avant de démarrer le diaporama.",
  cannotAccessView: "Impossible d’accéder à la vue Excalidraw active.",
} satisfies TranslationCatalog<SlideshowTranslationKey>;
