import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { WizardTranslationKey } from "./en";
/** Additional labels fall back to English. */
export const ru = {
  title: "Управление страницами",
  frames: "Рамки",
  printing: "Печать",
  pages: "Страницы",
  pagesHint:
    "Оставьте пустым для всех страниц. Пример: 1, 3-5, 9-. Номера следуют алфавитному порядку рамок до пропуска пустых страниц.",
  invalidRange:
    "Введите номера или диапазоны, например 1, 3-5, 9-. Используйте положительные числа и возрастающие диапазоны.",
  pageList: "Страницы ({count}): {names}",
  noPages: "Нет страниц для печати. Проверьте диапазон и настройку пустых страниц.",
  print: "Экспорт в PDF",
} satisfies TranslationCatalog<WizardTranslationKey>;
