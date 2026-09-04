/**
 * @file deconstruction.ts
 * @overview Creates the new drawing, replaces the source selection with its embed, and opens it.
 */

import type { App, TFile } from "obsidian";

import {
  getUniqueVaultFilePath,
  isVaultRootFolderPath,
} from "../../sharedUtils/vaultPaths";
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

/** Waits for a vault path to resolve to a TFile. */
async function waitForVaultFile(
  ea: DeconstructEa,
  app: App,
  path: string,
  ownerWindow: Window,
): Promise<TFile | null> {
  for (let attempt = 0; attempt <= 100; attempt += 1) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof ea.obsidian.TFile) {
      return file;
    }
    if (attempt < 100) await sleepInWindow(ownerWindow, 50);
  }
  return null;
}

/** Waits for EA's newly-created Markdown file to become an Excalidraw drawing. */
async function waitForDrawingFile(
  ea: DeconstructEa,
  app: App,
  path: string,
  ownerWindow: Window,
): Promise<TFile | null> {
  for (let attempt = 0; attempt <= 100; attempt += 1) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof ea.obsidian.TFile && ea.isExcalidrawFile(file)) {
      return file;
    }
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

/** Returns true when a vault-relative file path is located directly in the vault root. */
function isVaultRootFilePath(path: string): boolean {
  return path.length > 0 && !path.includes("/");
}

/**
 * Creates the deconstructed drawing and guarantees an explicitly requested vault-root destination.
 *
 * `/` is a UI marker only. For the enforced destination we construct the vault-relative root path
 * ourselves (`filename.md`) instead of asking EA to resolve an empty/root folder. This avoids EA's
 * configured/current-folder fallback semantics entirely.
 */
async function createDrawingAtDestination(
  context: DeconstructionContext,
  destination: ValidatedDestination,
): Promise<string> {
  const { ea, app, uiState, ownerWindow } = context;
  // Both `/` (the UI marker) and an empty path represent the vault root.
  // The latter matters because older/canonicalizing destination code may turn `/` into `""`.
  const requestedVaultRoot = isVaultRootFolderPath(destination.folderPath);
  const intendedRootPath = requestedVaultRoot
    ? getUniqueVaultFilePath("/", destination.fileName, (path) =>
        Boolean(app.vault.getAbstractFileByPath(path)),
      )
    : null;
  const createOptions = {
    filename: destination.fileName,
    foldername: destination.folderPath,
    templatePath: uiState.templatePath,
    onNewPane: true,
    silent: true,
  };

  const newPath = await ea.create(createOptions);
  const normalizedNewPath = ea.obsidian.normalizePath(newPath);

  if (!requestedVaultRoot || isVaultRootFilePath(normalizedNewPath)) {
    return normalizedNewPath;
  }

  const createdFile = await waitForVaultFile(ea, app, normalizedNewPath, ownerWindow);
  if (!createdFile) {
    return normalizedNewPath;
  }

  if (!intendedRootPath) return normalizedNewPath;

  // Recalculate if the root target was occupied while EA was creating the drawing.
  const rootTarget = app.vault.getAbstractFileByPath(intendedRootPath)
    ? getUniqueVaultFilePath("/", destination.fileName, (path) =>
        Boolean(app.vault.getAbstractFileByPath(path)),
      )
    : intendedRootPath;

  await app.fileManager.renameFile(createdFile, rootTarget);

  // Return the path we explicitly asked Obsidian to move to. Do not depend on mutation timing
  // of the TFile object's path property.
  return rootTarget;
}

/** Executes the destructive part of deconstruction after destination input has been validated. */
export async function executeDeconstruction(
  context: DeconstructionContext,
  destination: ValidatedDestination,
  shouldAnchor: boolean,
): Promise<void> {
  const { ea, app, t, uiState, ownerWindow } = context;

  const newPath = await createDrawingAtDestination(context, destination);
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
