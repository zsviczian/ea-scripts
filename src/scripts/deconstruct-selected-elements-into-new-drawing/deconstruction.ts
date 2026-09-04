/**
 * @file deconstruction.ts
 * @overview Creates the new drawing, replaces the source selection with its embed, and opens it.
 */

import type { App, TFile } from "obsidian";

import { sleepInWindow } from "../../sharedUtils/windowTiming";
import type { DeconstructTranslator } from "./lang";
import type { DeconstructEa, DeconstructUiState } from "./types";

export interface DeconstructionBounds {
  topX: number;
  topY: number;
}

export interface ValidatedDestination {
  folderPath: string;
  fileName: string;
}

export interface DeconstructionContext {
  ea: DeconstructEa;
  app: App;
  t: DeconstructTranslator;
  bounds: DeconstructionBounds;
  uiState: DeconstructUiState;
  ownerWindow: Window;
}

type ApiWithHistory = ExcalidrawAPI & { history: { clear(): void } };

/** Waits for EA's newly-created Markdown file to become an Excalidraw drawing. */
async function waitForDrawingFile(
  ea: DeconstructEa,
  app: App,
  path: string,
  ownerWindow: Window,
): Promise<TFile | null> {
  for (let attempt = 0; attempt <= 100; attempt += 1) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof ea.obsidian.TFile && ea.isExcalidrawFile(file)) return file;
    if (attempt < 100) await sleepInWindow(ownerWindow, 50);
  }
  return null;
}

/** Reads export padding from the created file, falling back to plugin settings. */
function getExportPadding(ea: DeconstructEa, app: App, file: TFile): number {
  const rawPadding = app.metadataCache.getCache(file.path)?.frontmatter?.[
    "excalidraw-export-padding"
  ];
  const parsedPadding = Number.parseFloat(String(rawPadding));
  return Number.isNaN(parsedPadding) ? ea.plugin.settings.exportPaddingSVG : parsedPadding;
}

/** Marks the staged source elements deleted and inserts the new drawing embed in their place. */
async function replaceSelectionWithEmbed(
  context: DeconstructionContext,
  file: TFile,
  padding: number,
  shouldAnchor: boolean,
): Promise<void> {
  const { ea, bounds } = context;
  for (const element of ea.getElements()) {
    (element as Mutable<ExcalidrawElement>).isDeleted = true;
  }
  await ea.addImage(bounds.topX - padding, bounds.topY - padding, file, false, shouldAnchor);
  await ea.addElementsToView(false, true, true);
  (ea.getExcalidrawAPI() as ApiWithHistory | null)?.history.clear();
}

/** Opens the newly-created drawing according to the user's modal preference. */
async function openCreatedDrawing(context: DeconstructionContext, file: TFile): Promise<void> {
  const { ea, app, uiState } = context;
  if (!uiState.openDeconstructedImage) return;
  if (uiState.reuseTab) {
    ea.openFileInNewOrAdjacentLeaf(file);
    return;
  }
  await app.workspace.getLeaf("tab").openFile(file);
}

/** Executes the destructive part of deconstruction after destination input has been validated. */
export async function executeDeconstruction(
  context: DeconstructionContext,
  destination: ValidatedDestination,
  shouldAnchor: boolean,
): Promise<void> {
  const { ea, app, t, uiState, ownerWindow } = context;
  const fullPath = ea.obsidian.normalizePath(
    destination.folderPath
      ? `${destination.folderPath}/${destination.fileName}`
      : destination.fileName,
  );
  const pathParts = fullPath.split("/");
  const finalFileName = pathParts.pop();
  if (!finalFileName) {
    new Notice(t("somethingWentWrong"));
    return;
  }

  const newPath = await ea.create({
    filename: finalFileName,
    foldername: pathParts.join("/"),
    templatePath: uiState.templatePath,
    onNewPane: true,
    silent: true,
  });
  const file = await waitForDrawingFile(ea, app, newPath, ownerWindow);
  if (!file) {
    new Notice(t("somethingWentWrong"));
    return;
  }

  const padding = getExportPadding(ea, app, file);
  await replaceSelectionWithEmbed(context, file, padding, shouldAnchor);
  await openCreatedDrawing(context, file);
  if (!uiState.openDeconstructedImage) new Notice(t("deconstructionReady"));
}
