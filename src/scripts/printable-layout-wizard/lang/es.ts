import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { WizardTranslationKey } from "./en";
/** Additional labels fall back to English. */
export const es = {
  title: "Gestión de páginas",
  frames: "Marcos",
  printing: "Impresión",
  pages: "Páginas",
  pagesHint:
    "Deja vacío para todas las páginas. Ejemplo: 1, 3-5, 9-. Se numeran por orden alfabético de marcos, antes de omitir páginas vacías.",
  invalidRange:
    "Introduce números o rangos como 1, 3-5, 9-. Usa números positivos y rangos ascendentes.",
  pageList: "Páginas ({count}): {names}",
  noPages: "No hay páginas para imprimir. Revisa el rango y la opción de páginas vacías.",
  print: "Exportar a PDF",
} satisfies TranslationCatalog<WizardTranslationKey>;
