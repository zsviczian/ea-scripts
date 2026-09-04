/**
 * @file run.ts
 * @overview Prepares the selected elements and launches the deconstruction modal.
 */

import type { App } from "obsidian";

import { copyEmbeddedFilesToEa } from "../../sharedUtils/eaEmbeddedFiles";
import { openDeconstructModal } from "./modal";
import { loadDeconstructConfig } from "./settings";
import { getDeconstructUiState } from "./uiState";
import type { DeconstructTranslator } from "./lang";
import type { DeconstructEa } from "./types";

/** Runs Deconstruct Selected Elements Into New Drawing. */
export async function runDeconstructSelectedElements(
  scriptEa: ExcalidrawAutomate,
  app: App,
  t: DeconstructTranslator,
): Promise<void> {
  if (!scriptEa.verifyMinimumPluginVersion("2.27.0")) {
    new Notice(t("requiresNewerVersion"));
    return;
  }
  const targetView = scriptEa.targetView;
  if (!targetView) return;

  const selectedElements = scriptEa.getViewSelectedElements();
  if (selectedElements.length === 0) {
    new Notice(t("selectElements"));
    return;
  }

  const ea = scriptEa as DeconstructEa;
  const bounds = ea.getBoundingBox(selectedElements);
  ea.clear();
  ea.copyViewElementsToEAforEditing(selectedElements);
  copyEmbeddedFilesToEa(ea, ea.getElements());

  const config = await loadDeconstructConfig(ea, app, t);
  const defaultTemplatePath = config.templates[0]?.path ?? "";
  const uiState = getDeconstructUiState(targetView.ownerWindow, defaultTemplatePath);
  if (uiState.templatePath && !config.templates.some((file) => file.path === uiState.templatePath)) {
    uiState.templatePath = defaultTemplatePath;
  }

  openDeconstructModal({
    ea,
    app,
    t,
    config,
    uiState,
    bounds,
    ownerWindow: targetView.ownerWindow,
  });
}
