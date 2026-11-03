import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { WizardTranslationKey } from "./en";
/** Additional labels fall back to English. */
export const fr = {
  title: "Gestion des pages",
  frames: "Cadres",
  printing: "Impression",
  pages: "Pages",
  pagesHint:
    "Laisser vide pour toutes les pages. Exemple : 1, 3-5, 9-. Numérotation par ordre alphabétique des cadres, avant de sauter les pages vides.",
  invalidRange:
    "Saisir des numéros ou plages comme 1, 3-5, 9-. Utiliser des nombres positifs et des plages croissantes.",
  pageList: "Pages ({count}) : {names}",
  noPages: "Aucune page à imprimer. Vérifier la plage et le réglage des pages vides.",
  print: "Exporter en PDF",
} satisfies TranslationCatalog<WizardTranslationKey>;
