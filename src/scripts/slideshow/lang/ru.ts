import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { SlideshowTranslationKey } from "./en";

export const ru = {
  requiresNewerVersion:
    "Для этого скрипта требуется более новая версия Excalidraw. Установите последнюю версию.",
  noActiveView: "Откройте рисунок Excalidraw перед запуском презентации.",
  cannotAccessView: "Не удалось получить доступ к активному представлению Excalidraw.",
} satisfies TranslationCatalog<SlideshowTranslationKey>;
