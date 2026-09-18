/**
 * @file LogoTurtleSidepanel.ts
 * @overview Persistent sidepanel UI for authoring, validating, reloading, and running Turtle Logo programs.
 */

import { DEFAULT_LOGO_SOURCE, LOGO_EXAMPLES } from "./examples";
import { interpretLogo } from "./logoInterpreter";
import { renderLogoProgram } from "./logoRenderer";
import { LOGO_TURTLE_STYLES } from "./styles";
import type { LogoEditorState, LogoProgramResult, LogoStoredScript } from "./types";
import type { LogoTurtleTranslator } from "./lang";

interface LogoTurtleSidepanelOptions {
  ea: ExcalidrawAutomate;
  tab: ScriptSidepanelTab;
  t: LogoTurtleTranslator;
}

const SETTINGS_KEY = "excalidrawLogoTurtle";
const DEFAULT_STATE: LogoEditorState = {
  name: "",
  source: DEFAULT_LOGO_SOURCE,
  animationDelayMs: 12,
};

const KEYWORDS = new Set([
  "to", "end", "repeat", "for", "while", "if", "ifelse", "run", "stop", "output", "op",
  "make", "localmake", "and", "or", "not", "true", "false",
]);

const COMMANDS = new Set([
  "forward", "fd", "back", "bk", "backward", "right", "rt", "left", "lt", "home", "setxy",
  "setx", "sety", "setxy", "setpos", "setposition", "setheading", "seth", "penup", "pu", "pendown", "pd", "showturtle", "st",
  "hideturtle", "ht", "setpencolor", "setpc", "setcolor", "setpensize", "setpw", "setwidth", "setpenwidth", "setfillcolor",
  "beginfill", "endfill", "setfontsize", "label", "wait", "print", "pr", "show", "clean", "clearscreen", "cs",
]);

const REPORTERS = new Set([
  "random", "sqrt", "abs", "round", "int", "sin", "cos", "tan", "arctan", "power", "modulo",
  "remainder", "min", "max", "sum", "difference", "product", "quotient", "pi", "repcount", "heading",
  "xcor", "ycor", "pos", "pencolor", "pensize", "shownp", "pendownp", "towards", "distance", "thing", "word", "sentence", "se", "first", "last", "count", "ifelsevalue",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredScript(element: ExcalidrawElement | null): LogoStoredScript | null {
  if (!element || !isRecord(element.customData)) return null;
  const value = element.customData.excalidrawLogoTurtle;
  if (!isRecord(value) || value.version !== 1 || typeof value.name !== "string" || typeof value.source !== "string") return null;
  return {
    version: 1,
    name: value.name,
    source: value.source,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
  };
}

function readState(ea: ExcalidrawAutomate, t: LogoTurtleTranslator): LogoEditorState {
  const settings = ea.getScriptSettings();
  const value = settings[SETTINGS_KEY];
  if (!isRecord(value)) return { ...DEFAULT_STATE, name: t("exampleRainbow") };
  return {
    name: typeof value.name === "string" ? value.name : t("exampleRainbow"),
    source: typeof value.source === "string" ? value.source : DEFAULT_STATE.source,
    animationDelayMs:
      typeof value.animationDelayMs === "number" && Number.isFinite(value.animationDelayMs)
        ? Math.max(0, Math.min(40, value.animationDelayMs))
        : DEFAULT_STATE.animationDelayMs,
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function classifyToken(token: string): string | null {
  const lower = token.toLowerCase();
  if (token.startsWith(":")) return "variable";
  if (token.startsWith('"')) return "word";
  if (/^\d+(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(token)) return "number";
  if (KEYWORDS.has(lower)) return "keyword";
  if (COMMANDS.has(lower)) return "command";
  if (REPORTERS.has(lower)) return "reporter";
  if (/^[+\-*/%^=<>()[\]]+$/.test(token)) return "symbol";
  return null;
}

function highlightCodePart(value: string): string {
  const tokens = value.match(/(:[A-Za-z_][\w-]*|"#[0-9A-Fa-f]+|"[\w.-]+|\d+(?:\.\d+)?(?:e[-+]?\d+)?|<=|>=|<>|!=|==|[+\-*/%^=<>()[\]]|[A-Za-z_][\w-]*|\s+|.)/g) ?? [];
  return tokens.map((token) => {
    const escaped = escapeHtml(token);
    const kind = classifyToken(token);
    return kind ? `<span class="logo-turtle-token--${kind}">${escaped}</span>` : escaped;
  }).join("");
}

function highlightLogo(source: string): string {
  return source.split("\n").map((line) => {
    const commentIndex = line.indexOf(";");
    if (commentIndex < 0) return highlightCodePart(line);
    const code = highlightCodePart(line.slice(0, commentIndex));
    const comment = escapeHtml(line.slice(commentIndex));
    return `${code}<span class="logo-turtle-token--comment">${comment}</span>`;
  }).join("\n") + "\n";
}

function setIcon(ea: ExcalidrawAutomate, button: HTMLElement, iconName: string): void {
  const icon = ea.obsidian.getIcon(iconName);
  if (icon) button.appendChild(icon.cloneNode(true));
}

function exampleLabel(index: number, t: LogoTurtleTranslator): string {
  const keys = ["exampleRainbow", "exampleTree", "exampleFlower", "exampleStars", "exampleSierpinski"] as const;
  return t(keys[index] ?? "exampleRainbow");
}

/** Owns the persistent Logo Turtle panel and its view-aware run lifecycle. */
export class LogoTurtleSidepanel {
  private state: LogoEditorState;
  private abortController: AbortController | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private highlight: HTMLPreElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private runButton: HTMLButtonElement | null = null;
  private speedLabel: HTMLSpanElement | null = null;
  private statusEl: HTMLDivElement | null = null;
  private outputEl: HTMLPreElement | null = null;
  private selectionEl: HTMLDivElement | null = null;
  private selectionTextEl: HTMLDivElement | null = null;
  private selectedStoredScript: LogoStoredScript | null = null;
  private saveTimer = 0;
  private built = false;

  public constructor(private readonly options: LogoTurtleSidepanelOptions) {
    this.state = readState(options.ea, options.t);
  }

  /** Installs sidepanel, scene-selection, and cleanup hooks. */
  public initialize(): void {
    const { ea, tab } = this.options;
    tab.onOpen = () => this.ensureBuilt();
    tab.onFocus = (view) => {
      ea.setView(view);
      ea.clear();
      this.syncViewState();
    };
    tab.onExcalidrawViewClosed = () => {
      ea.setView(null);
      this.syncViewState();
    };
    tab.onWindowMigrated = () => this.syncEditorScroll();
    tab.onClose = () => {
      this.abortController?.abort();
      this.abortController = null;
      if (this.saveTimer) (tab.contentEl.ownerDocument.defaultView ?? window).clearTimeout(this.saveTimer);
      this.saveTimer = 0;
      ea.onSceneChangeHook = null;
      void this.saveState();
    };
    ea.onSceneChangeHook = {
      appStateKeys: ["selectedElementIds"],
      trackElements: false,
      triggerWhenInvisible: false,
      callback: (
        _elements: readonly ExcalidrawElement[],
        _appState: unknown,
        _files: unknown,
        view: ScriptExcalidrawView,
      ) => {
        if (view && view !== ea.targetView) ea.setView(view);
        this.updateSelectedScript();
      },
    };
    this.ensureBuilt();
  }

  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    this.buildUi();
    this.syncViewState();
  }

  private buildUi(): void {
    const { ea, tab, t } = this.options;
    const doc = tab.contentEl.ownerDocument;
    tab.contentEl.replaceChildren();
    tab.contentEl.classList.add("logo-turtle-panel");
    const style = doc.createElement("style");
    style.textContent = LOGO_TURTLE_STYLES;
    tab.contentEl.appendChild(style);
    this.buildHeader(doc);
    this.buildInputs(doc);
    this.buildSelectionRow(doc);
    this.buildEditor(doc);
    this.buildControls(doc);
    this.statusEl = doc.createElement("div");
    this.statusEl.className = "logo-turtle-status";
    this.statusEl.textContent = t("ready");
    tab.contentEl.appendChild(this.statusEl);
    this.buildOutput(doc);
    this.updateSelectedScript();
    this.renderHighlight();
    if (!ea.targetView) this.setStatus(t("noView"));
  }

  private buildHeader(doc: Document): void {
    const { ea, tab, t } = this.options;
    const header = doc.createElement("div");
    header.className = "logo-turtle-header";
    const brand = doc.createElement("div");
    brand.className = "logo-turtle-brand";
    const icon = doc.createElement("div");
    icon.className = "logo-turtle-brand__icon";
    setIcon(ea, icon, "move");
    const heading = doc.createElement("div");
    heading.className = "logo-turtle-heading";
    const title = doc.createElement("h2");
    title.textContent = t("heading");
    const tagline = doc.createElement("div");
    tagline.className = "logo-turtle-tagline";
    tagline.textContent = t("tagline");
    heading.append(title, tagline);
    brand.append(icon, heading);
    const info = doc.createElement("button");
    info.className = "logo-turtle-icon-button";
    info.setAttribute("aria-label", t("info"));
    info.setAttribute("title", t("info"));
    setIcon(ea, info, "info");
    info.addEventListener("click", () => this.openInfoModal());
    header.append(brand, info);
    tab.contentEl.appendChild(header);
  }

  private buildInputs(doc: Document): void {
    const { tab, t } = this.options;
    const grid = doc.createElement("div");
    grid.className = "logo-turtle-grid";
    const nameField = doc.createElement("div");
    nameField.className = "logo-turtle-field";
    const nameLabel = doc.createElement("label");
    nameLabel.textContent = t("scriptName");
    const input = doc.createElement("input");
    input.type = "text";
    input.value = this.state.name;
    input.placeholder = t("scriptNamePlaceholder");
    input.addEventListener("input", () => {
      this.state.name = input.value;
      this.scheduleSave();
    });
    this.nameInput = input;
    nameField.append(nameLabel, input);
    const exampleField = doc.createElement("div");
    exampleField.className = "logo-turtle-field";
    const exampleLabelEl = doc.createElement("label");
    exampleLabelEl.textContent = t("example");
    const row = doc.createElement("div");
    row.className = "logo-turtle-example-row";
    const select = doc.createElement("select");
    LOGO_EXAMPLES.forEach((_example, index) => {
      const option = doc.createElement("option");
      option.value = String(index);
      option.textContent = exampleLabel(index, t);
      select.appendChild(option);
    });
    const load = doc.createElement("button");
    load.textContent = t("loadExample");
    load.addEventListener("click", () => this.loadExample(Number(select.value)));
    row.append(select, load);
    exampleField.append(exampleLabelEl, row);
    grid.append(nameField, exampleField);
    tab.contentEl.appendChild(grid);
  }

  private buildSelectionRow(doc: Document): void {
    const { tab, t } = this.options;
    const row = doc.createElement("div");
    row.className = "logo-turtle-selection";
    const text = doc.createElement("div");
    text.className = "logo-turtle-selection__text";
    text.textContent = t("unsavedSelectionHint");
    const button = doc.createElement("button");
    button.textContent = t("loadSelected");
    button.addEventListener("click", () => this.loadSelectedScript());
    row.append(text, button);
    tab.contentEl.appendChild(row);
    this.selectionEl = row;
    this.selectionTextEl = text;
  }

  private buildEditor(doc: Document): void {
    const { tab, t } = this.options;
    const heading = doc.createElement("div");
    heading.className = "logo-turtle-editor-heading";
    const label = doc.createElement("div");
    label.className = "logo-turtle-section-label";
    label.textContent = t("editorLabel");
    const hint = doc.createElement("div");
    hint.className = "logo-turtle-editor-hint";
    hint.textContent = t("editorHint");
    heading.append(label, hint);
    tab.contentEl.appendChild(heading);
    const editor = doc.createElement("div");
    editor.className = "logo-turtle-editor";
    const highlight = doc.createElement("pre");
    highlight.className = "logo-turtle-highlight";
    highlight.setAttribute("aria-hidden", "true");
    const textarea = doc.createElement("textarea");
    textarea.className = "logo-turtle-textarea";
    textarea.spellcheck = false;
    textarea.value = this.state.source;
    textarea.setAttribute("aria-label", t("editorLabel"));
    textarea.addEventListener("input", () => this.onSourceChanged());
    textarea.addEventListener("scroll", () => this.syncEditorScroll());
    textarea.addEventListener("keydown", (event) => this.onEditorKeydown(event));
    editor.append(highlight, textarea);
    tab.contentEl.appendChild(editor);
    this.highlight = highlight;
    this.textarea = textarea;
  }

  private buildControls(doc: Document): void {
    const { ea, tab, t } = this.options;
    const controls = doc.createElement("div");
    controls.className = "logo-turtle-controls";
    const run = doc.createElement("button");
    run.className = "mod-cta logo-turtle-run";
    setIcon(ea, run, "play");
    const runText = doc.createElement("span");
    runText.textContent = t("run");
    run.appendChild(runText);
    run.addEventListener("click", () => {
      if (this.abortController) this.stopRun();
      else void this.runProgram();
    });
    this.runButton = run;
    const validate = doc.createElement("button");
    validate.className = "logo-turtle-validate";
    setIcon(ea, validate, "check-circle-2");
    const validateText = doc.createElement("span");
    validateText.textContent = t("validate");
    validate.appendChild(validateText);
    validate.addEventListener("click", () => this.validateProgram());
    const speed = doc.createElement("label");
    speed.className = "logo-turtle-speed";
    const speedTitle = doc.createElement("span");
    speedTitle.textContent = t("animation");
    const slider = doc.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "40";
    slider.step = "2";
    slider.value = String(this.state.animationDelayMs);
    const speedValue = doc.createElement("span");
    this.speedLabel = speedValue;
    this.updateSpeedLabel();
    slider.addEventListener("input", () => {
      this.state.animationDelayMs = Number(slider.value);
      this.updateSpeedLabel();
      this.scheduleSave();
    });
    speed.append(speedTitle, slider, speedValue);
    controls.append(run, validate, speed);
    tab.contentEl.appendChild(controls);
  }

  private buildOutput(doc: Document): void {
    const { tab, t } = this.options;
    const details = doc.createElement("details");
    details.className = "logo-turtle-output";
    const summary = doc.createElement("summary");
    summary.textContent = t("outputTitle");
    const output = doc.createElement("pre");
    output.textContent = t("outputEmpty");
    details.append(summary, output);
    tab.contentEl.appendChild(details);
    this.outputEl = output;
  }

  private onSourceChanged(): void {
    if (!this.textarea) return;
    this.state.source = this.textarea.value;
    this.renderHighlight();
    this.scheduleSave();
  }

  private onEditorKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!this.abortController) void this.runProgram();
      return;
    }
    if (event.key !== "Tab" || !this.textarea) return;
    event.preventDefault();
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    this.textarea.setRangeText("  ", start, end, "end");
    this.onSourceChanged();
  }

  private renderHighlight(): void {
    if (!this.highlight || !this.textarea) return;
    this.highlight.innerHTML = highlightLogo(this.textarea.value);
    this.syncEditorScroll();
  }

  private syncEditorScroll(): void {
    if (!this.highlight || !this.textarea) return;
    this.highlight.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollLeft = this.textarea.scrollLeft;
  }

  private loadExample(index: number): void {
    const example = LOGO_EXAMPLES[index] ?? LOGO_EXAMPLES[0];
    if (!example || !this.textarea || !this.nameInput) return;
    this.state.name = exampleLabel(index, this.options.t);
    this.state.source = example.source;
    this.nameInput.value = this.state.name;
    this.textarea.value = this.state.source;
    this.renderHighlight();
    this.scheduleSave();
    this.textarea.focus();
  }

  private updateSpeedLabel(): void {
    if (!this.speedLabel) return;
    this.speedLabel.textContent = this.state.animationDelayMs === 0
      ? this.options.t("instant")
      : this.options.t("animationMs", { value: this.state.animationDelayMs });
  }

  private scheduleSave(): void {
    const win = this.options.tab.contentEl.ownerDocument.defaultView ?? window;
    if (this.saveTimer) win.clearTimeout(this.saveTimer);
    this.saveTimer = win.setTimeout(() => {
      this.saveTimer = 0;
      void this.saveState();
    }, 350);
  }

  private async saveState(): Promise<void> {
    const settings = this.options.ea.getScriptSettings();
    settings[SETTINGS_KEY] = { ...this.state };
    await this.options.ea.setScriptSettings(settings);
  }

  private validateProgram(): void {
    const { t } = this.options;
    this.setStatus(t("validating"));
    try {
      const result = interpretLogo(this.state.source);
      this.setOutput(result.output);
      this.setStatus(t("valid", { commands: result.commandCount, operations: result.operations.length }), "success");
    } catch (error) {
      this.setStatus(t("parseError", { message: error instanceof Error ? error.message : String(error) }), "error");
    }
  }

  private async runProgram(): Promise<void> {
    const { ea, t } = this.options;
    if (!ea.targetView) {
      this.setStatus(t("noView"), "error");
      return;
    }
    let result: LogoProgramResult;
    try {
      result = interpretLogo(this.state.source);
    } catch (error) {
      this.setStatus(t("parseError", { message: error instanceof Error ? error.message : String(error) }), "error");
      return;
    }
    this.setOutput(result.output);
    await this.saveState();
    const controller = new AbortController();
    this.abortController = controller;
    this.setRunning(true);
    this.setStatus(t("drawing"));
    try {
      const summary = await renderLogoProgram(
        ea,
        result,
        this.state.name.trim() || t("sidepanelTitle"),
        this.state.source,
        this.state.animationDelayMs,
        controller.signal,
      );
      this.setStatus(t("done", { commands: result.commandCount, elements: summary.elementIds.length }), "success");
      this.updateSelectedScript();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") this.setStatus(t("stopped"));
      else this.setStatus(t("renderError", { message: error instanceof Error ? error.message : String(error) }), "error");
    } finally {
      if (this.abortController === controller) this.abortController = null;
      this.setRunning(false);
    }
  }

  private stopRun(): void {
    this.abortController?.abort();
  }

  private setRunning(running: boolean): void {
    if (!this.runButton) return;
    this.runButton.replaceChildren();
    setIcon(this.options.ea, this.runButton, running ? "square" : "play");
    const label = this.runButton.ownerDocument.createElement("span");
    label.textContent = this.options.t(running ? "stop" : "run");
    this.runButton.appendChild(label);
  }

  private setStatus(message: string, state?: "success" | "error"): void {
    if (!this.statusEl) return;
    this.statusEl.className = "logo-turtle-status";
    if (state) this.statusEl.classList.add(`is-${state}`);
    this.statusEl.textContent = message;
  }

  private setOutput(lines: readonly string[]): void {
    if (!this.outputEl) return;
    this.outputEl.textContent = lines.length > 0 ? lines.join("\n") : this.options.t("outputEmpty");
  }

  private syncViewState(): void {
    const hasView = Boolean(this.options.ea.targetView);
    if (this.runButton) this.runButton.disabled = !hasView;
    if (!hasView) this.setStatus(this.options.t("noView"));
    else if (!this.abortController) this.setStatus(this.options.t("ready"));
    this.updateSelectedScript();
  }

  private updateSelectedScript(): void {
    const selected = this.options.ea.targetView ? this.options.ea.getViewSelectedElements() : [];
    const match = selected.map((element) => readStoredScript(element)).find((value) => value !== null) ?? null;
    this.selectedStoredScript = match;
    if (!this.selectionEl || !this.selectionTextEl) return;
    this.selectionEl.classList.toggle("is-visible", Boolean(match));
    this.selectionTextEl.textContent = match
      ? this.options.t("selectedScript", { name: match.name })
      : this.options.t("unsavedSelectionHint");
  }

  private loadSelectedScript(): void {
    const stored = this.selectedStoredScript;
    if (!stored || !this.textarea || !this.nameInput) return;
    this.state.name = stored.name;
    this.state.source = stored.source;
    this.nameInput.value = stored.name;
    this.textarea.value = stored.source;
    this.renderHighlight();
    this.scheduleSave();
    this.setStatus(this.options.t("loadedSelected"), "success");
    this.textarea.focus();
  }

  private openInfoModal(): void {
    const { ea, t } = this.options;
    const modal = new ea.obsidian.Modal(app);
    modal.titleEl.setText(t("infoTitle"));
    const root = modal.contentEl;
    root.classList.add("logo-turtle-help");
    const style = root.ownerDocument.createElement("style");
    style.textContent = LOGO_TURTLE_STYLES;
    root.appendChild(style);
    const intro = root.ownerDocument.createElement("p");
    intro.textContent = t("infoIntro");
    root.appendChild(intro);
    this.appendHelpSection(root, t("infoBasicsTitle"), t("infoBasics"));
    this.appendHelpSection(root, t("infoPenTitle"), t("infoPen"));
    this.appendHelpSection(root, t("infoControlTitle"), t("infoControl"));
    this.appendHelpSection(root, t("infoProceduresTitle"), t("infoProcedures"));
    this.appendHelpSection(root, t("infoMathTitle"), t("infoMath"));
    this.appendHelpSection(root, t("infoConsoleTitle"), t("infoConsole"));
    this.appendHelpSection(root, t("infoCanvasTitle"), t("infoCanvas"));
    this.appendHelpSection(root, t("infoSafetyTitle"), t("infoSafety"));
    this.appendHelpSection(root, t("infoDifferencesTitle"), t("infoDifferences"));
    const exampleHeading = root.ownerDocument.createElement("h3");
    exampleHeading.textContent = t("infoExampleTitle");
    const example = root.ownerDocument.createElement("div");
    example.className = "logo-turtle-help__example";
    example.textContent = t("infoExample");
    root.append(exampleHeading, example);
    this.appendLinks(root);
    modal.open();
  }

  private appendHelpSection(root: HTMLElement, title: string, text: string): void {
    const heading = root.ownerDocument.createElement("h3");
    heading.textContent = title;
    const paragraph = root.ownerDocument.createElement("p");
    paragraph.textContent = text;
    root.append(heading, paragraph);
  }

  private appendLinks(root: HTMLElement): void {
    const { t } = this.options;
    const heading = root.ownerDocument.createElement("h3");
    heading.textContent = t("infoLinksTitle");
    const links = root.ownerDocument.createElement("div");
    links.className = "logo-turtle-help__links";
    const resources: Array<[string, string]> = [
      [t("linkBerkeley"), "https://people.eecs.berkeley.edu/~bh/docs/usermanual.pdf"],
      [t("linkTurtleAcademy"), "https://www.turtleacademy.com/lessons"],
      [t("linkLogoFoundation"), "https://el.media.mit.edu/logo-foundation/resources/papers/pdf/csta.pdf"],
    ];
    for (const [label, href] of resources) {
      const link = root.ownerDocument.createElement("a");
      link.textContent = label;
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      links.appendChild(link);
    }
    root.append(heading, links);
  }
}
