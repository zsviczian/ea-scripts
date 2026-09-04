/**
 * @file folderSuggest.ts
 * @overview Folder autocomplete adapter backed by the shared folder-ranking utility.
 */

import type { App, TFolder } from "obsidian";

import { rankVaultFolderSuggestions } from "../../sharedUtils/vaultPaths";
import type { DeconstructEa } from "./types";

export interface FolderSuggestHandle {
  close(): void;
}

/** Attaches vault-folder autocomplete to a text input. */
export function attachFolderSuggest(
  ea: DeconstructEa,
  app: App,
  inputEl: HTMLInputElement,
): FolderSuggestHandle {
  const BaseSuggest = ea.obsidian.AbstractInputSuggest;

  class FolderSuggest extends BaseSuggest<string> {
    private readonly targetInput: HTMLInputElement;

    constructor() {
      super(app, inputEl);
      this.targetInput = inputEl;
    }

    getSuggestions(query: string): string[] {
      const folderPaths = app.vault
        .getAllLoadedFiles()
        .filter((file): file is TFolder => file instanceof ea.obsidian.TFolder)
        .map((folder) => folder.path);
      return rankVaultFolderSuggestions(folderPaths, query);
    }

    renderSuggestion(value: string, el: HTMLElement): void {
      el.setText(value);
    }

    selectSuggestion(value: string, _event: MouseEvent | KeyboardEvent): void {
      this.targetInput.value = value;
      const ownerWindow = this.targetInput.ownerDocument.defaultView;
      if (ownerWindow) {
        this.targetInput.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
      }
      this.close();
    }
  }

  return new FolderSuggest();
}
