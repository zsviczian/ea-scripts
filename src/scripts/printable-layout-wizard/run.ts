import { createWizardTranslator } from "./lang";
import { openWizard } from "./WizardDialog";

/** Validates the Script Engine host before opening the view-bound wizard. */
export function runWizard(ea: ExcalidrawAutomate): void {
  const t = createWizardTranslator(ea.obsidian.moment.locale());
  if (!ea.verifyMinimumPluginVersion("2.27.0")) {
    new ea.obsidian.Notice(t("requiresVersion", { version: "2.27.0" }));
    return;
  }
  if (!ea.targetView?.file || !ea.getExcalidrawAPI()) {
    new ea.obsidian.Notice(t("noView"));
    return;
  }
  openWizard(ea, t);
}
