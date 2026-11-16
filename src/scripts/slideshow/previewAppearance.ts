/** Scene-owned preview appearance, including the fork's exact dark-mode color transform. */
import type { AppState } from "@zsviczian/excalidraw/types";

type PreviewColorRuntime = Pick<typeof import("@zsviczian/excalidraw/common/colors"), "applyDarkModeFilter">;

/** Returns the export theme, rendered background and cache identity for a live drawing. */
export function getPreviewAppearance(state: Pick<AppState, "theme" | "viewBackgroundColor">): {
  theme: AppState["theme"];
  backgroundColor: string;
  key: string;
} {
  const color = typeof state.viewBackgroundColor === "string" ? state.viewBackgroundColor : "#ffffff";
  // The generated Script Engine ambient snapshot predates this published fork
  // export. Derive the narrow runtime declaration from the installed package.
  const backgroundColor = state.theme === "dark"
    ? (window.ExcalidrawLib as typeof window.ExcalidrawLib & PreviewColorRuntime).applyDarkModeFilter(color)
    : color;
  return { theme: state.theme, backgroundColor, key: `${state.theme}|${color}` };
}
