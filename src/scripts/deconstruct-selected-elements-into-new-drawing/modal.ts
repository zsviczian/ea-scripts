/**
 * @file modal.ts
 * @overview Modal UI for destination, template, open behavior, and insertion mode.
 */

import type { Setting, TextComponent } from "obsidian";

import {
  executeDeconstruction,
  type DeconstructionContext,
} from "./deconstruction";
import {
  formatDestinationValidationError,
  validateDeconstructionDestination,
} from "./destination";
import { attachFolderSuggest, type FolderSuggestHandle } from "./folderSuggest";
import type { DeconstructConfig } from "./types";

interface ModalContext extends DeconstructionContext {
  config: DeconstructConfig;
}

interface ModalInputs {
  folder: TextComponent;
  file: TextComponent;
}

/** Creates a labelled text input using Obsidian's setting-item layout. */
function createTextInput(
  context: ModalContext,
  content: HTMLElement,
  label: string,
  value: string,
): TextComponent {
  const row = content.createDiv({ cls: "setting-item" });
  row.createDiv({ cls: "setting-item-info" }).createEl("label", { text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const input = new context.ea.obsidian.TextComponent(control);
  input.setValue(value);
  input.inputEl.style.width = "100%";
  return input;
}

/** Adds template and open-behavior settings to the modal. */
function addBehaviorSettings(context: ModalContext, content: HTMLElement): void {
  const { ea, t, config, uiState } = context;
  new ea.obsidian.Setting(content).setName(t("selectTemplate")).addDropdown((dropdown) => {
    if (config.templates.length === 0) dropdown.addOption("", t("noTemplate"));
    for (const file of config.templates) dropdown.addOption(file.path, file.basename);
    dropdown.setValue(uiState.templatePath).onChange((value) => {
      uiState.templatePath = value;
    });
  });

  let reuseSetting: Setting | null = null;
  new ea.obsidian.Setting(content)
    .setName(t("openDeconstructedImage"))
    .addToggle((toggle) =>
      toggle.setValue(uiState.openDeconstructedImage).onChange((value) => {
        uiState.openDeconstructedImage = value;
        if (reuseSetting) reuseSetting.settingEl.style.display = value ? "" : "none";
      }),
    );

  reuseSetting = new ea.obsidian.Setting(content)
    .setName(t("reuseExistingTab"))
    .setDesc(t("reuseExistingTabDesc"))
    .setClass("reuse-tab-setting")
    .addToggle((toggle) =>
      toggle.setValue(uiState.reuseTab).onChange((value) => {
        uiState.reuseTab = value;
      }),
    );
  reuseSetting.settingEl.style.display = uiState.openDeconstructedImage ? "" : "none";
  reuseSetting.settingEl.style.borderTop = "none";
}

/** Validates input, closes the modal, and starts deconstruction. */
async function submitDeconstruction(
  context: ModalContext,
  modal: import("obsidian").Modal,
  inputs: ModalInputs,
  shouldAnchor: boolean,
): Promise<void> {
  const destination = validateDeconstructionDestination(
    inputs.folder.getValue(),
    inputs.file.getValue(),
  );
  if (!destination.valid) {
    new Notice(formatDestinationValidationError(context.t, destination));
    return;
  }
  modal.close();
  await executeDeconstruction(context, destination, shouldAnchor);
}

/** Adds the two insertion buttons to the modal. */
function addButtons(
  context: ModalContext,
  modal: import("obsidian").Modal,
  content: HTMLElement,
  inputs: ModalInputs,
): void {
  const buttons = content.createDiv({ cls: "excalidraw-dialog-buttons" });
  buttons.style.marginTop = "20px";
  buttons.style.display = "flex";
  buttons.style.gap = "12px";
  buttons.style.justifyContent = "flex-end";

  new context.ea.obsidian.ButtonComponent(buttons)
    .setButtonText(context.t("insert"))
    .setTooltip(context.t("insertTooltip"))
    .onClick(async () => submitDeconstruction(context, modal, inputs, false));

  new context.ea.obsidian.ButtonComponent(buttons)
    .setButtonText(context.t("insertAt100"))
    .setTooltip(context.t("insertAt100Tooltip"))
    .setCta()
    .onClick(async () => submitDeconstruction(context, modal, inputs, true));
}

/** Opens the deconstruction modal. */
export function openDeconstructModal(context: ModalContext): void {
  const { ea, app, t, config } = context;
  const modal = new ea.FloatingModal(app);
  modal.setTitle(t("modalTitle"));
  let folderSuggest: FolderSuggestHandle | null = null;

  modal.onOpen = (): void => {
    const content = modal.contentEl;
    content.empty();
    const currentFolder = ea.targetView?.file.parent?.path ?? "";
    const folderInput = createTextInput(context, content, t("folderPath"), currentFolder);
    folderSuggest = attachFolderSuggest(ea, app, folderInput.inputEl);
    const fileInput = createTextInput(context, content, t("fileName"), config.defaultFileName);
    ea.targetView?.ownerWindow.setTimeout(() => fileInput.inputEl.focus(), 50);
    addBehaviorSettings(context, content);
    addButtons(context, modal, content, { folder: folderInput, file: fileInput });
  };

  modal.onClose = (): void => {
    folderSuggest?.close();
    modal.contentEl.empty();
  };
  modal.open();
}
