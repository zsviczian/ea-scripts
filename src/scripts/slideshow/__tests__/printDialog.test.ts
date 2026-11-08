import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { openSlideshowPrintDialog } from "../PrintDialog";
import { createSlideshowTranslator } from "../lang";

/** Models only the host dialog/control boundary; the production dialog owns state and validation. */
function dialogFixture(
  theme: "light" | "dark",
  preferences: Record<string, unknown> = {},
): {
  result: ReturnType<typeof openSlideshowPrintDialog>;
  ea: {
    FloatingModal: unknown;
    setScriptSettings: Mock<(value: Record<string, unknown>) => Promise<void>>;
  };
  controls: Map<string, { value: string; listener: () => void }>;
  toggles: Map<
    string,
    { value: boolean; change: (value: boolean) => void; row: { hidden: boolean } }
  >;
  buttons: Map<string, { listener: () => void }>;
  modal: { close: () => void };
} {
  const controls = new Map<string, Control>();
  const buttons = new Map<string, Control>();
  const toggles = new Map<
    string,
    { value: boolean; change: (value: boolean) => void; row: Control }
  >();
  class Control {
    public hidden = false;
    public value = "";
    public selectedIndex = 0;
    public listener = (): void => undefined;
    public createEl(
      tag: string,
      info: { text?: string; value?: string; attr?: Record<string, string> } = {},
    ): Control {
      const child = new Control();
      child.value = info.value ?? "";
      if (tag === "option" && !this.value) this.value = child.value;
      if (info.attr?.["aria-label"]) controls.set(info.attr["aria-label"], child);
      if (tag === "button") buttons.set(info.text!, child);
      return child;
    }
    public createDiv(): Control {
      return new Control();
    }
    public setText(): void {}
    public setCssStyles(): void {}
    public toggle(show: boolean): void {
      this.hidden = !show;
    }
    public addEventListener(event: string, listener: () => void): void {
      this.listener = listener;
    }
    public focus(): void {}
  }
  class FloatingModal {
    public contentEl = new Control();
    public titleEl = new Control();
    public onClose = (): void => undefined;
    public open(): void {}
    public close(): void {
      this.onClose();
    }
  }
  class Setting {
    public controlEl = new Control();
    public settingEl = new Control();
    public name = "";
    public setName(name: string): this {
      this.name = name;
      return this;
    }
    public setDesc(): this {
      return this;
    }
    public addToggle(
      callback: (toggle: {
        setValue: (value: boolean) => { onChange: (change: (value: boolean) => void) => void };
      }) => void,
    ): this {
      callback({
        setValue: (value) => ({
          onChange: (change) => {
            toggles.set(this.name, { value, change, row: this.settingEl });
          },
        }),
      });
      return this;
    }
  }
  let settings: Record<string, unknown> = {
    slideshowPrintPreferences: { theme: theme === "dark" ? "light" : "dark", ...preferences },
  };
  const constructor = vi.fn(function () {
    return new FloatingModal();
  });
  const ea = {
    FloatingModal: constructor,
    obsidian: {
      Setting,
      Modal: vi.fn(() => {
        throw new Error("Regular modal used");
      }),
    },
    getScriptSettings: () => settings,
    setScriptSettings: vi.fn(async (value) => {
      settings = value;
    }),
    getExcalidrawAPI: () => ({ getAppState: () => ({ theme }) }),
  };
  vi.stubGlobal("app", {});
  const result = openSlideshowPrintDialog(
    ea as never,
    {
      width: 1920,
      height: 1080,
      sourceKey: "frame",
      choices: { frame: { deck: { name: null } }, lines: [] } as never,
    },
    createSlideshowTranslator("en"),
  );
  return {
    result,
    ea,
    controls,
    toggles,
    buttons,
    modal: constructor.mock.results[0]!.value as FloatingModal,
  };
}

afterEach(() => vi.unstubAllGlobals());
describe("floating print setup", () => {
  it.each(["notes", "handout-2", "handout-3"])(
    "offers slide frames only in %s layout",
    async (layout) => {
      const fixture = dialogFixture("light");
      const frames = fixture.toggles.get("Include frames around slides")!;
      expect(frames.value).toBe(false);
      expect(frames.row.hidden).toBe(true);
      const layoutControl = fixture.controls.get("Layout")!;
      layoutControl.value = layout;
      layoutControl.listener();
      expect(frames.row.hidden).toBe(false);
      frames.change(true);
      fixture.buttons.get("Create PDF")!.listener();
      expect(await fixture.result).toMatchObject({ layout, includeFrames: true });
    },
  );
  it("restores the handout frame preference but excludes frames from slides-only output", async () => {
    const fixture = dialogFixture("light", { layout: "handout-2", includeFrames: true });
    const frames = fixture.toggles.get("Include frames around slides")!;
    expect(frames.value).toBe(true);
    expect(frames.row.hidden).toBe(false);
    const layout = fixture.controls.get("Layout")!;
    layout.value = "slides";
    layout.listener();
    expect(frames.row.hidden).toBe(true);
    layout.value = "notes";
    layout.listener();
    expect(frames.row.hidden).toBe(false);
    layout.value = "slides";
    layout.listener();
    fixture.buttons.get("Create PDF")!.listener();
    expect(await fixture.result).toMatchObject({ layout: "slides", includeFrames: false });
    expect(fixture.ea.setScriptSettings.mock.calls[0]![0].slideshowPrintPreferences).toMatchObject({
      includeFrames: true,
    });
  });
  it.each(["light", "dark"] as const)(
    "defaults to the %s scene theme even with a stale saved theme",
    async (theme) => {
      const fixture = dialogFixture(theme);
      expect(fixture.ea.FloatingModal).toHaveBeenCalledOnce();
      expect(fixture.controls.get("Print theme")!.value).toBe(theme);
      fixture.modal.close();
      expect(await fixture.result).toBeNull();
      expect(fixture.ea.setScriptSettings).not.toHaveBeenCalled();
    },
  );
  it("returns an explicit theme choice while leaving scene-theme defaults independent of saved preferences", async () => {
    const fixture = dialogFixture("dark");
    fixture.controls.get("Print theme")!.value = "light";
    fixture.buttons.get("Create PDF")!.listener();
    expect(await fixture.result).toMatchObject({ theme: "light", width: 1920, height: 1080 });
    expect(
      fixture.ea.setScriptSettings.mock.calls[0]![0].slideshowPrintPreferences,
    ).not.toHaveProperty("theme");
  });
});
