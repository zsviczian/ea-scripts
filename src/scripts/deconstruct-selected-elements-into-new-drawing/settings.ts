/**
 * @file settings.ts
 * @overview Loads legacy-compatible script settings and resolves available drawing templates.
 */

import type { App, TFile } from "obsidian";

import type { DeconstructTranslator } from "./lang";
import type { DeconstructConfig, DeconstructEa } from "./types";

const TEMPLATES_SETTING = "Templates";
const DEFAULT_FILE_NAME_SETTING = "Default file name";
const DEFAULT_FILE_NAME = "deconstructed";

interface TextScriptSetting {
  value: string;
  description: string;
}

/** Returns a text setting entry when the persisted value has the expected shape. */
function asTextScriptSetting(value: unknown): TextScriptSetting | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.value !== "string") return null;
  return {
    value: record.value,
    description: typeof record.description === "string" ? record.description : "",
  };
}

/** Adds any missing script-engine settings without disturbing unrelated entries. */
async function ensureSettings(
  ea: DeconstructEa,
  t: DeconstructTranslator,
): Promise<Record<string, unknown>> {
  const current = ea.getScriptSettings() ?? {};
  const templates = asTextScriptSetting(current[TEMPLATES_SETTING]);
  const defaultFileName = asTextScriptSetting(current[DEFAULT_FILE_NAME_SETTING]);
  if (templates && defaultFileName) return current;

  const next: Record<string, unknown> = { ...current };
  if (!templates) {
    next[TEMPLATES_SETTING] = {
      value: "",
      description: t("templatesSettingDesc"),
    } satisfies TextScriptSetting;
  }
  if (!defaultFileName) {
    next[DEFAULT_FILE_NAME_SETTING] = {
      value: DEFAULT_FILE_NAME,
      description: t("defaultFilenameSettingDesc"),
    } satisfies TextScriptSetting;
  }
  await ea.setScriptSettings(next);
  return next;
}

/** Resolves configured template linkpaths together with Excalidraw's template list. */
function resolveTemplates(ea: DeconstructEa, app: App, configuredPaths: string): TFile[] {
  const customTemplates = configuredPaths
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => app.metadataCache.getFirstLinkpathDest(path, ""))
    .filter((file): file is TFile => file !== null);
  const byPath = new Map<string, TFile>();
  for (const file of [...customTemplates, ...(ea.getListOfTemplateFiles() ?? [])]) {
    byPath.set(file.path, file);
  }
  return [...byPath.values()].sort((left, right) => left.basename.localeCompare(right.basename));
}

/** Loads script settings and returns the runtime configuration used by the modal. */
export async function loadDeconstructConfig(
  ea: DeconstructEa,
  app: App,
  t: DeconstructTranslator,
): Promise<DeconstructConfig> {
  const settings = await ensureSettings(ea, t);
  const templatesSetting = asTextScriptSetting(settings[TEMPLATES_SETTING]);
  const defaultFileNameSetting = asTextScriptSetting(settings[DEFAULT_FILE_NAME_SETTING]);
  const configuredTemplatePaths = templatesSetting?.value ?? "";
  return {
    defaultFileName: defaultFileNameSetting?.value || DEFAULT_FILE_NAME,
    templates: resolveTemplates(ea, app, configuredTemplatePaths),
  };
}
