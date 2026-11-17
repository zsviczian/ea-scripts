/** @file main.ts @overview ExcaliAI task editor, sketch analysis and image generation. */
import { runExcaliAI } from "./run.js";
import { createExcaliAITranslator } from "./lang";

void runExcaliAI(ea, utils).catch((error: unknown): void => {
  const t = createExcaliAITranslator(ea.obsidian.moment.locale());
  new ea.obsidian.Notice(t("scriptFailed"));
  console.error(error);
});
