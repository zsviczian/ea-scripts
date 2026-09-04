/**
 * @file types.ts
 * @overview Script-local runtime types for deconstructing selected elements into a new drawing.
 */

import type { App, Modal, TFile } from "obsidian";

import type { EaEmbeddedFileHost } from "../../sharedUtils/eaEmbeddedFiles";

export interface DeconstructUiState {
  openDeconstructedImage: boolean;
  reuseTab: boolean;
  templatePath: string;
}

export interface DeconstructConfig {
  defaultFileName: string;
  templates: TFile[];
}

export interface CreateDrawingOptions {
  filename: string;
  foldername: string;
  templatePath: string;
  onNewPane: boolean;
  silent: boolean;
}

export interface DeconstructEa extends EaEmbeddedFileHost {
  readonly FloatingModal: new (app: App) => Modal;
  readonly plugin: {
    readonly settings: {
      exportPaddingSVG: number;
    };
  };
  getListOfTemplateFiles(): TFile[] | null;
  getNewUniqueFilepath(filename: string, folderpath: string): string;
  create(options: CreateDrawingOptions): Promise<string>;
  isExcalidrawFile(file?: TFile): boolean;
  addImage(
    topX: number,
    topY: number,
    file: TFile,
    scaleToFit: boolean,
    shouldAnchor: boolean,
  ): Promise<string>;
  openFileInNewOrAdjacentLeaf(file: TFile): unknown;
}

export interface DeconstructWindow extends Window {
  ExcalidrawDeconstructElements?: DeconstructUiState;
}
