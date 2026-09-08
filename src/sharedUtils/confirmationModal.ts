/**
 * @file confirmationModal.ts
 * @overview Native Obsidian confirmation modal helper for EA scripts.
 */

import type { App } from "obsidian";

export interface ConfirmationModalOptions {
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
}

/** Opens a native Obsidian modal and resolves whether the user confirmed. */
export function openConfirmationModal(
  ea: ExcalidrawAutomate,
  app: App,
  options: ConfirmationModalOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ea.obsidian.Modal(app);
    let settled = false;

    const finish = (confirmed: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(confirmed);
      modal.close();
    };

    if (options.title) modal.titleEl.setText(options.title);
    modal.contentEl.createEl("p", { text: options.message });

    const actions = modal.contentEl.createDiv({ cls: "modal-button-container" });
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "var(--size-4-2)";

    new ea.obsidian.ButtonComponent(actions)
      .setButtonText(options.cancelText)
      .onClick(() => finish(false));

    const confirmButton = new ea.obsidian.ButtonComponent(actions)
      .setButtonText(options.confirmText)
      .setCta()
      .onClick(() => finish(true));

    modal.onClose = (): void => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
      modal.contentEl.empty();
    };

    modal.open();
    confirmButton.buttonEl.focus();
  });
}
