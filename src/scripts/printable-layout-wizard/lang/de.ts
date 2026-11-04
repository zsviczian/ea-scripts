import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { WizardTranslationKey } from "./en";
/** Additional labels fall back to English. */
export const de = {
  preview: "Druckvorschau",
  previewPage: "{number}: {name}",
  emptyPage: "Leere Seite",
  previewFailed: "Vorschau nicht verfügbar",
  refreshPreview: "Vorschau aktualisieren",
  printCount: "{count} Seiten",
  printCountOne: "1 Seite",

  title: "Seitenverwaltung",
  frames: "Rahmen",
  printing: "Drucken",
  pages: "Seiten",
  pagesHint:
    "Leer lassen für alle Seiten. Beispiel: 1, 3-5, 9-. Nummerierung nach alphabetischer Rahmenreihenfolge, bevor leere Seiten übersprungen werden.",
  invalidRange:
    "Seitenzahlen oder Bereiche wie 1, 3-5, 9- eingeben. Positive Zahlen und aufsteigende Bereiche verwenden.",
  pageList: "Seiten ({count}): {names}",
  noPages: "Keine Seiten zum Drucken. Seitenbereich und Einstellung für leere Seiten prüfen.",
  print: "Als PDF exportieren",
} satisfies TranslationCatalog<WizardTranslationKey>;
