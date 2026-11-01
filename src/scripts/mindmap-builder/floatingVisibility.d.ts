/** Narrow boundary for the retained JavaScript floating-toolbar lifecycle. */
export interface FloatingVisibilityView {
  getViewType(): string;
}

export interface FloatingVisibilityContext {
  isUndocked: boolean;
  floatingInputModal: {modalEl: {style: {display: string}}} | null;
  isExcaliBrainView(): boolean;
  ea: {
    targetView: FloatingVisibilityView | null;
    plugin: {app: {workspace: {activeLeaf: {view: FloatingVisibilityView} | null}}};
    isExcalidrawView(view: FloatingVisibilityView | null | undefined): boolean;
    getExcalidrawAPI(): {
      getAppState(): {viewModeEnabled: boolean};
      onChange(callback: (elements: readonly unknown[], state: {viewModeEnabled: boolean}) => void): () => void;
    } | null;
  };
}

/** Reflect active drawing mode without changing the saved docking preference. */
export function updateFloatingVisibility(context: FloatingVisibilityContext, view?: FloatingVisibilityView | null, state?: {viewModeEnabled: boolean}): void;
/** Subscribe to the exact current drawing and return its cleanup callback. */
export function watchFloatingVisibility(context: FloatingVisibilityContext, view: FloatingVisibilityView): () => void;
