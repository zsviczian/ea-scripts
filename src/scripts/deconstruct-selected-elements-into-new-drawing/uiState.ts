/**
 * @file uiState.ts
 * @overview Maintains the legacy-compatible per-window deconstruction UI preferences.
 */

import type { DeconstructUiState, DeconstructWindow } from "./types";

/** Returns the window-scoped UI state, preserving the legacy global property name. */
export function getDeconstructUiState(
  ownerWindow: Window,
  defaultTemplatePath: string,
): DeconstructUiState {
  const deconstructWindow = ownerWindow as DeconstructWindow;
  const existing = deconstructWindow.ExcalidrawDeconstructElements;
  if (!existing) {
    const state: DeconstructUiState = {
      openDeconstructedImage: true,
      reuseTab: true,
      templatePath: defaultTemplatePath,
    };
    deconstructWindow.ExcalidrawDeconstructElements = state;
    return state;
  }
  if (typeof existing.reuseTab !== "boolean") existing.reuseTab = true;
  if (typeof existing.openDeconstructedImage !== "boolean") {
    existing.openDeconstructedImage = true;
  }
  if (typeof existing.templatePath !== "string") existing.templatePath = defaultTemplatePath;
  return existing;
}
