/**
 * @file eaEmbeddedFiles.ts
 * @overview Shared helper for carrying file-backed image/equation data with EA workbench elements.
 */

import type { TFile } from "obsidian";

type ImageElement = Extract<ExcalidrawElement, { type: "image" }>;

interface ExcalidrawDataFileRecord {
  mimeType: string;
  img: string;
  mtime: number;
  file?: TFile | null;
  linkParts?: { original?: string } | null;
  hyperlink?: string | undefined;
  isSVGwithBitmap?: boolean;
}

interface ExcalidrawEquationRecord {
  latex: string;
}

interface SceneFileRecord {
  mimeType: string;
  dataURL: string;
  created: number;
}

interface EmbeddedFileView extends ScriptExcalidrawView {
  readonly excalidrawData: {
    getFile(fileId: string): ExcalidrawDataFileRecord | null | undefined;
    getEquation(fileId: string): ExcalidrawEquationRecord | null | undefined;
  };
  getScene(): { files: Record<string, SceneFileRecord | undefined> } | null;
}

export interface EaEmbeddedFileRecord {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
  file: string | null | undefined;
  hyperlink?: string | undefined;
  hasSVGwithBitmap: boolean | null | undefined;
  latex: string | null;
  colorMap?: unknown;
}

export interface EaEmbeddedFileHost extends ExcalidrawAutomate {
  targetView: EmbeddedFileView | null;
  readonly imagesDict: Record<string, EaEmbeddedFileRecord>;
  getColorMapForImageElement(element: ImageElement): unknown;
}

/** Copies one ordinary image's backing data into EA's image dictionary. */
function copyImageFile(
  ea: EaEmbeddedFileHost,
  element: ImageElement,
  fileId: string,
): boolean {
  const view = ea.targetView;
  if (!view) return false;
  const image = view.excalidrawData.getFile(fileId);
  const filePath = image?.linkParts?.original ?? image?.file?.path;
  const hyperlink = image?.hyperlink;
  if (!image || (!filePath && !hyperlink)) return false;

  ea.imagesDict[fileId] = {
    mimeType: image.mimeType,
    id: fileId,
    dataURL: image.img,
    created: image.mtime,
    file: filePath,
    hyperlink,
    hasSVGwithBitmap: image.isSVGwithBitmap,
    latex: null,
    colorMap: ea.getColorMapForImageElement(element),
  };
  return true;
}

/** Copies one equation image's generated scene file into EA's image dictionary. */
function copyEquationFile(
  ea: EaEmbeddedFileHost,
  element: ImageElement,
  fileId: string,
): void {
  const view = ea.targetView;
  if (!view) return;
  const equation = view.excalidrawData.getEquation(fileId);
  const sceneFile = view.getScene()?.files[fileId];
  if (!equation || !sceneFile) return;

  ea.imagesDict[fileId] = {
    mimeType: sceneFile.mimeType,
    id: fileId,
    dataURL: sceneFile.dataURL,
    created: sceneFile.created,
    file: null,
    hasSVGwithBitmap: null,
    latex: equation.latex,
  };
}

/**
 * Ensures image elements staged in EA retain their file/equation payloads when
 * they are written into a different drawing.
 */
export function copyEmbeddedFilesToEa(
  ea: EaEmbeddedFileHost,
  elements: readonly ExcalidrawElement[],
): void {
  for (const element of elements) {
    if (element.type !== "image" || !element.fileId) continue;
    if (!copyImageFile(ea, element, element.fileId)) {
      copyEquationFile(ea, element, element.fileId);
    }
  }
}
