import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { ExcaliAITranslationKey } from "./en";
/** Untranslated task prompts and advanced UI fall back to English. */
export const fr: TranslationCatalog<ExcaliAITranslationKey> = {
  noView: "Ouvrez d’abord un dessin Excalidraw.",
  requiresVersion:
    "Ce script nécessite Excalidraw 2.29.3 ou une version ultérieure. Mettez le plugin à jour.",
  prompt: "Instruction",
  advancedSettings: "{value1} <span>Paramètres avancés</span>",
  systemPrompt: "Instruction système",
  textModel2: "Modèle de texte",
  imageModel2: "Modèle d’image",
  textMaxTokenOverride: "Limite de jetons du texte",
  reasoningHelp: "Effort de raisonnement : {effort} (paramètres IA d’Excalidraw).",
  reasoningDefault: "Valeur par défaut de l’API",
};
