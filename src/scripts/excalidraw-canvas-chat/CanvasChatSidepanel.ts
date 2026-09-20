/**
 * @file CanvasChatSidepanel.ts
 * @overview Persistent chat UI, history browser, settings, and Excalidraw view lifecycle.
 */

import { runAgentTurn } from "./agent";
import { chatThreadToMarkdown } from "./chatExport";
import {
  appendMessage,
  createThread,
  loadChatSettings,
  loadChatStore,
  saveChatSettings,
  saveChatStore,
} from "./persistence";
import { CANVAS_CHAT_STYLES } from "./styles";
import type { ExcalidrawSidepanelTab } from "../../../.template/types/sidepanelTab";
import type { CanvasChatTranslator } from "./lang";
import type { CanvasChatSettings, ChatHistoryStore, ChatThread } from "./types";

interface SidepanelOptions {
  ea: ExcalidrawAutomate;
  tab: ExcalidrawSidepanelTab;
  t: CanvasChatTranslator;
}

function setIcon(ea: ExcalidrawAutomate, element: HTMLElement, iconName: string): void {
  const icon = ea.obsidian.getIcon(iconName);
  if (icon) element.appendChild(icon.cloneNode(true));
}

function button(doc: Document, ea: ExcalidrawAutomate, iconName: string, label: string): HTMLButtonElement {
  const el = doc.createElement("button");
  el.className = "canvas-chat-icon-button";
  el.type = "button";
  el.title = label;
  el.setAttribute("aria-label", label);
  setIcon(ea, el, iconName);
  return el;
}

function formatCompactTokens(tokens: number): string {
  if (tokens < 1000) return `≈${tokens} ctx`;
  return `≈${(tokens / 1000).toFixed(tokens < 10000 ? 1 : 0)}k ctx`;
}

/** Owns the persistent Canvas Chat sidepanel and view-aware chat lifecycle. */
export class CanvasChatSidepanel {
  private settings: CanvasChatSettings;
  private store: ChatHistoryStore;
  private storage: Storage | null = null;
  private readonly storageNamespace: string;
  private messagesEl: HTMLDivElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private contextEl: HTMLDivElement | null = null;
  private contextTextEl: HTMLDivElement | null = null;
  private tokenButton: HTMLButtonElement | null = null;
  private progressEl: HTMLDivElement | null = null;
  private estimatedContextTokens = 0;
  private busy = false;
  private built = false;

  public constructor(private readonly options: SidepanelOptions) {
    this.settings = loadChatSettings(options.ea);
    this.store = { version: 1, activeThreadId: null, threads: [] };
    this.storageNamespace = options.ea.plugin.app.vault.getName();
  }

  /** Installs persistent sidepanel hooks and a lightweight file-context listener. */
  public initialize(): void {
    const { ea, tab } = this.options;
    tab.onOpen = () => this.ensureBuilt();
    tab.onFocus = (view) => {
      ea.setView(view);
      ea.clear();
      this.updateContextBadge();
    };
    tab.onExcalidrawViewClosed = () => {
      ea.setView(null);
      this.updateContextBadge();
    };
    tab.onWindowMigrated = () => {
      this.storage = this.getStorage();
      this.updateContextBadge();
    };
    tab.onClose = () => saveChatStore(this.storage, this.store, this.storageNamespace);
    const fileOpenRef = ea.plugin.app.workspace.on("file-open", () => this.updateContextBadge());
    ea.registerCleanup(() => ea.plugin.app.workspace.offref(fileOpenRef));
    this.ensureBuilt();
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    this.storage = this.getStorage();
    this.store = loadChatStore(this.storage, this.storageNamespace);
    if (!this.getActiveThread()) createThread(this.store);
    this.buildUi();
    this.renderMessages();
    this.updateContextBadge();
  }

  private getStorage(): Storage | null {
    try { return this.options.tab.contentEl.ownerDocument.defaultView?.localStorage ?? null; } catch { return null; }
  }

  private getActiveThread(): ChatThread | null {
    return this.store.threads.find((thread) => thread.id === this.store.activeThreadId) ?? null;
  }

  private buildUi(): void {
    const { ea, tab, t } = this.options;
    const doc = tab.contentEl.ownerDocument;
    tab.contentEl.replaceChildren();
    tab.contentEl.classList.add("canvas-chat-panel");
    const style = doc.createElement("style");
    style.textContent = CANVAS_CHAT_STYLES;
    tab.contentEl.appendChild(style);
    this.buildHeader(doc);
    this.buildContext(doc);
    const messagesEl = doc.createElement("div");
    messagesEl.className = "canvas-chat-messages";
    this.messagesEl = messagesEl;
    tab.contentEl.appendChild(messagesEl);
    const progressEl = doc.createElement("div");
    progressEl.className = "canvas-chat-progress";
    progressEl.hidden = true;
    this.progressEl = progressEl;
    const spinner = doc.createElement("span");
    spinner.className = "canvas-chat-spinner";
    const progressText = doc.createElement("span");
    progressText.textContent = "Thinking…";
    progressEl.append(spinner, progressText);
    tab.contentEl.appendChild(progressEl);
    this.buildComposer(doc);
    if (!ea.getAISettings()?.enabled) new ea.obsidian.Notice(t("aiDisabled"));
  }

  private buildHeader(doc: Document): void {
    const { ea, tab, t } = this.options;
    const header = doc.createElement("div");
    header.className = "canvas-chat-header";
    const brand = doc.createElement("div");
    brand.className = "canvas-chat-brand";
    const brandIcon = doc.createElement("div");
    brandIcon.className = "canvas-chat-brand__icon";
    setIcon(ea, brandIcon, "messages-square");
    const labels = doc.createElement("div");
    labels.style.minWidth = "0";
    const title = doc.createElement("div");
    title.className = "canvas-chat-title";
    title.textContent = t("title");
    const subtitle = doc.createElement("div");
    subtitle.className = "canvas-chat-subtitle";
    subtitle.textContent = t("subtitle");
    labels.append(title, subtitle);
    brand.append(brandIcon, labels);
    const actions = doc.createElement("div");
    actions.className = "canvas-chat-actions";
    const newChat = button(doc, ea, "square-pen", t("newChat"));
    const history = button(doc, ea, "history", t("history"));
    const copy = button(doc, ea, "copy", t("copyChat"));
    const settings = button(doc, ea, "settings", t("settings"));
    const info = button(doc, ea, "info", t("info"));
    newChat.addEventListener("click", () => this.startNewChat());
    history.addEventListener("click", () => this.openHistoryModal());
    copy.addEventListener("click", () => void this.copyCurrentChat());
    settings.addEventListener("click", () => this.openSettingsModal());
    info.addEventListener("click", () => this.openInfoModal());
    actions.append(newChat, history, copy, settings, info);
    header.append(brand, actions);
    tab.contentEl.appendChild(header);
  }

  private buildContext(doc: Document): void {
    const row = doc.createElement("div");
    row.className = "canvas-chat-context";
    this.contextEl = row;
    const dot = doc.createElement("span");
    dot.className = "canvas-chat-context__dot";
    this.contextTextEl = doc.createElement("div");
    this.contextTextEl.className = "canvas-chat-context__text";
    this.tokenButton = doc.createElement("button");
    this.tokenButton.className = "canvas-chat-token";
    this.tokenButton.type = "button";
    this.tokenButton.textContent = formatCompactTokens(0);
    this.tokenButton.title = "Approximate current context tokens · click for session AI usage";
    this.tokenButton.addEventListener("click", () => this.options.ea.showAIUsageModal());
    row.append(dot, this.contextTextEl, this.tokenButton);
    this.options.tab.contentEl.appendChild(row);
  }

  private buildComposer(doc: Document): void {
    const { ea, tab, t } = this.options;
    const composer = doc.createElement("div");
    composer.className = "canvas-chat-composer";
    const wrap = doc.createElement("div");
    wrap.className = "canvas-chat-input-wrap";
    this.inputEl = doc.createElement("textarea");
    this.inputEl.className = "canvas-chat-input";
    this.inputEl.rows = 2;
    this.inputEl.placeholder = t("placeholder");
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.sendCurrentInput();
      }
    });
    this.inputEl.addEventListener("input", () => this.autoSizeInput());
    this.sendButton = doc.createElement("button");
    this.sendButton.className = "canvas-chat-send";
    this.sendButton.type = "button";
    this.sendButton.title = t("send");
    this.sendButton.setAttribute("aria-label", t("send"));
    setIcon(ea, this.sendButton, "arrow-up");
    this.sendButton.addEventListener("click", () => void this.sendCurrentInput());
    wrap.append(this.inputEl, this.sendButton);
    const hint = doc.createElement("div");
    hint.className = "canvas-chat-hint";
    hint.textContent = t("composerHint");
    composer.append(wrap, hint);
    tab.contentEl.appendChild(composer);
  }

  private autoSizeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.style.height = "auto";
    this.inputEl.style.height = `${Math.min(140, Math.max(38, this.inputEl.scrollHeight))}px`;
  }

  private startNewChat(): void {
    createThread(this.store);
    saveChatStore(this.storage, this.store, this.storageNamespace);
    this.estimatedContextTokens = 0;
    this.renderMessages();
    this.updateTokenDisplay();
    this.inputEl?.focus();
  }

  private async copyCurrentChat(): Promise<void> {
    const thread = this.getActiveThread();
    if (!thread || thread.messages.length === 0) {
      new this.options.ea.obsidian.Notice(this.options.t("nothingToCopy"));
      return;
    }
    const markdown = chatThreadToMarkdown(thread);
    const doc = this.options.tab.contentEl.ownerDocument;
    try {
      const clipboard = doc.defaultView?.navigator.clipboard;
      if (clipboard) {
        await clipboard.writeText(markdown);
      } else {
        const textarea = doc.createElement("textarea");
        textarea.value = markdown;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        doc.body.appendChild(textarea);
        textarea.select();
        if (!doc.execCommand("copy")) throw new Error("Clipboard copy failed.");
        textarea.remove();
      }
      new this.options.ea.obsidian.Notice(this.options.t("chatCopied"));
    } catch {
      new this.options.ea.obsidian.Notice(this.options.t("copyFailed"));
    }
  }

  private renderMessages(): void {
    if (!this.messagesEl) return;
    const { ea, t } = this.options;
    const doc = this.messagesEl.ownerDocument;
    this.messagesEl.replaceChildren();
    const thread = this.getActiveThread();
    if (!thread || thread.messages.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "canvas-chat-empty";
      const icon = doc.createElement("div");
      icon.className = "canvas-chat-empty__icon";
      setIcon(ea, icon, "sparkles");
      const title = doc.createElement("div");
      title.className = "canvas-chat-empty__title";
      title.textContent = t("emptyTitle");
      const body = doc.createElement("div");
      body.textContent = t("emptyBody");
      const examples = doc.createElement("div");
      examples.className = "canvas-chat-empty__examples";
      for (const key of ["suggestion1", "suggestion2", "suggestion3", "suggestion4"] as const) {
        const suggestion = doc.createElement("button");
        suggestion.className = "canvas-chat-suggestion";
        suggestion.type = "button";
        suggestion.textContent = t(key);
        suggestion.addEventListener("click", () => {
          if (this.inputEl) this.inputEl.value = t(key);
          this.autoSizeInput();
          this.inputEl?.focus();
        });
        examples.appendChild(suggestion);
      }
      empty.append(icon, title, body, examples);
      this.messagesEl.appendChild(empty);
      return;
    }
    for (const message of thread.messages) {
      const row = doc.createElement("div");
      row.className = `canvas-chat-message is-${message.role}`;
      const bubble = doc.createElement("div");
      bubble.className = "canvas-chat-bubble";
      bubble.textContent = message.content;
      const time = doc.createElement("div");
      time.className = "canvas-chat-time";
      const date = new Date(message.createdAt);
      time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      row.append(bubble, time);
      this.messagesEl.appendChild(row);
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async sendCurrentInput(): Promise<void> {
    if (this.busy || !this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;
    const thread = this.getActiveThread() ?? createThread(this.store);
    appendMessage(thread, "user", text);
    this.inputEl.value = "";
    this.autoSizeInput();
    saveChatStore(this.storage, this.store, this.storageNamespace);
    this.renderMessages();
    this.setBusy(true, "Thinking about the canvas…");
    try {
      const result = await runAgentTurn(this.options.ea, this.settings, thread.messages, (status) => this.setProgress(status));
      appendMessage(thread, "assistant", result.reply);
      this.estimatedContextTokens = result.estimatedContextTokens;
    } catch (error) {
      appendMessage(thread, "assistant", `I couldn't complete that turn: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      saveChatStore(this.storage, this.store, this.storageNamespace);
      this.setBusy(false);
      this.renderMessages();
      this.updateContextBadge();
      this.updateTokenDisplay();
      this.inputEl?.focus();
    }
  }

  private setBusy(busy: boolean, status = ""): void {
    this.busy = busy;
    if (this.inputEl) this.inputEl.disabled = busy;
    if (this.sendButton) this.sendButton.disabled = busy;
    if (this.progressEl) this.progressEl.hidden = !busy;
    if (busy && status) this.setProgress(status);
  }

  private setProgress(status: string): void {
    const text = this.progressEl?.querySelector("span:last-child");
    if (text) text.textContent = status;
  }

  private updateTokenDisplay(): void {
    if (this.tokenButton) this.tokenButton.textContent = formatCompactTokens(this.estimatedContextTokens);
  }

  private updateContextBadge(): void {
    if (!this.contextEl || !this.contextTextEl) return;
    const ea = this.options.ea;
    const activeFile = ea.plugin.app.workspace.getActiveFile();
    const target = ea.targetView as ({ file?: { path: string } | null }) | null;
    const canvasPath = target?.file?.path;
    this.contextEl.classList.toggle("is-canvas", Boolean(canvasPath));
    this.contextTextEl.textContent = canvasPath
      ? `Canvas: ${canvasPath}${activeFile && activeFile.path !== canvasPath ? ` · Note: ${activeFile.path}` : ""}`
      : activeFile ? `Note: ${activeFile.path}` : this.options.t("noCanvas");
  }

  private openSettingsModal(): void {
    const { ea, t } = this.options;
    const ai = ea.getAISettings();
    const modal = new ea.obsidian.Modal(ea.plugin.app);
    modal.titleEl.setText(t("settingsTitle"));
    const doc = modal.contentEl.ownerDocument;
    const style = doc.createElement("style");
    style.textContent = CANVAS_CHAT_STYLES;
    modal.contentEl.appendChild(style);
    if (!ai) {
      modal.contentEl.createEl("p", { text: t("aiDisabled") });
      modal.open();
      return;
    }

    const readyTextModels = Object.keys(ai.textModels).filter(
      (id) => ai.providerProfiles[ai.textModels[id]?.providerId ?? ""]?.hasApiKey,
    );
    const readyImageModels = Object.keys(ai.imageModels).filter(
      (id) => ai.providerProfiles[ai.imageModels[id]?.providerId ?? ""]?.hasApiKey,
    );
    const draft: CanvasChatSettings = {
      ...this.settings,
      textModelId: readyTextModels.includes(this.settings.textModelId) ? this.settings.textModelId : "auto",
      imageModelId: readyImageModels.includes(this.settings.imageModelId) ? this.settings.imageModelId : "auto",
    };

    new ea.obsidian.Setting(modal.contentEl)
      .setName(t("textModel"))
      .addDropdown((dropdown) => {
        dropdown.addOption("auto", t("autoModel"));
        for (const id of readyTextModels) {
          dropdown.addOption(id, `${id} · ${ai.textModels[id]?.model ?? id}`);
        }
        dropdown.setValue(draft.textModelId).onChange((value) => {
          draft.textModelId = value;
        });
      });

    new ea.obsidian.Setting(modal.contentEl)
      .setName(t("imageModel"))
      .addDropdown((dropdown) => {
        dropdown.addOption("auto", t("autoModel"));
        for (const id of readyImageModels) {
          dropdown.addOption(id, `${id} · ${ai.imageModels[id]?.model ?? id}`);
        }
        dropdown.setValue(draft.imageModelId).onChange((value) => {
          draft.imageModelId = value;
        });
      });

    new ea.obsidian.Setting(modal.contentEl)
      .setName(t("maxResponseTokens"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "256";
        text.inputEl.max = "8000";
        text.inputEl.step = "128";
        text.setValue(String(draft.maxResponseTokens)).onChange((value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) draft.maxResponseTokens = Math.max(256, Math.min(8000, parsed));
        });
      });

    new ea.obsidian.Setting(modal.contentEl)
      .setName(t("debugLogging"))
      .setDesc(t("debugLoggingHelp"))
      .addToggle((toggle) =>
        toggle.setValue(draft.debugLogging).onChange((value) => {
          draft.debugLogging = value;
        }),
      );

    const help = doc.createElement("p");
    help.className = "canvas-chat-modal-help";
    help.textContent = t("settingsHelp");
    modal.contentEl.appendChild(help);

    const footer = doc.createElement("div");
    footer.className = "canvas-chat-modal-footer";
    const save = doc.createElement("button");
    save.className = "mod-cta";
    save.textContent = t("save");
    save.addEventListener("click", () => {
      this.settings = { ...draft, version: 1 };
      void saveChatSettings(ea, this.settings);
      modal.close();
    });
    footer.appendChild(save);
    modal.contentEl.appendChild(footer);
    modal.open();
  }

  private openHistoryModal(): void {
    const { ea, t } = this.options;
    const modal = new ea.obsidian.Modal(ea.plugin.app);
    modal.titleEl.setText(t("historyTitle"));
    const doc = modal.contentEl.ownerDocument;
    const style = doc.createElement("style");
    style.textContent = CANVAS_CHAT_STYLES;
    modal.contentEl.appendChild(style);
    if (this.store.threads.length === 0) modal.contentEl.createEl("p", { text: t("historyEmpty") });
    const list = doc.createElement("div");
    list.className = "canvas-chat-history-list";
    for (const thread of this.store.threads) {
      const item = doc.createElement("div");
      item.className = "canvas-chat-history-item";
      const body = doc.createElement("div");
      body.className = "canvas-chat-history-item__body";
      const title = doc.createElement("div");
      title.className = "canvas-chat-history-item__title";
      title.textContent = thread.title;
      const meta = doc.createElement("div");
      meta.className = "canvas-chat-history-item__meta";
      meta.textContent = t("historyMeta", { messages: String(thread.messages.length), date: new Date(thread.updatedAt).toLocaleDateString() });
      body.append(title, meta);
      item.appendChild(body);
      item.addEventListener("click", () => {
        this.store.activeThreadId = thread.id;
        saveChatStore(this.storage, this.store, this.storageNamespace);
        this.estimatedContextTokens = 0;
        this.renderMessages();
        this.updateTokenDisplay();
        modal.close();
      });
      list.appendChild(item);
    }
    modal.contentEl.appendChild(list);
    modal.open();
  }

  private openInfoModal(): void {
    const { ea, t } = this.options;
    const modal = new ea.obsidian.Modal(ea.plugin.app);
    modal.titleEl.setText(t("infoTitle"));
    const sections = [
      ["infoIntro", ""],
      ["infoCanvas", "infoCanvasTitle"],
      ["infoContext", "infoContextTitle"],
      ["infoIdeas", "infoIdeasTitle"],
      ["infoTokens", "infoTokensTitle"],
    ] as const;
    for (const [bodyKey, titleKey] of sections) {
      if (titleKey) modal.contentEl.createEl("h3", { text: t(titleKey) });
      modal.contentEl.createEl("p", { text: t(bodyKey) });
    }
    modal.open();
  }
}
