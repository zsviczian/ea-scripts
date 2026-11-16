import { describe, expect, it, vi } from "vitest";

import { getAnimationEditorIcon, type AnimationIconChoice } from "../icons";

describe("animation control icons", () => {
  it.each<[AnimationIconChoice, string]>([
    ["appear", "eye"], ["fade", "circle-fading-plus"],
    ["slide", "arrow-right-to-line"], ["zoom", "zoom-in"],
    ["disappear", "eye-off"], ["slide-out", "arrow-right-from-line"],
    ["zoom-out", "zoom-out"], ["after-delay", "timer"], ["advance", "step-forward"],
  ])("resolves %s through Obsidian's Lucide registry", (choice, name) => {
    const getIcon = vi.fn(() => ({ outerHTML: `<svg class="lucide-${name}"></svg>` }));
    const ea = { obsidian: { getIcon } } as unknown as ExcalidrawAutomate;
    expect(getAnimationEditorIcon(ea, choice, false)).toContain(`lucide-${name}`);
    expect(getIcon).toHaveBeenCalledExactlyOnceWith(`lucide-${name}`);
  });

  it.each<[AnimationIconChoice, string, string]>([
    ["left", "arrow-big-right-dash", "arrow-big-left-dash"],
    ["right", "arrow-big-left-dash", "arrow-big-right-dash"],
    ["up", "arrow-big-down-dash", "arrow-big-up-dash"],
    ["down", "arrow-big-up-dash", "arrow-big-down-dash"],
  ])("points %s toward the target for entrances and away for exits", (direction, entrance, exit) => {
    const getIcon = vi.fn((name: string) => ({ outerHTML: `<svg class="${name}"></svg>` }));
    const ea = { obsidian: { getIcon } } as unknown as ExcalidrawAutomate;
    expect(getAnimationEditorIcon(ea, direction, false)).toContain(entrance);
    expect(getAnimationEditorIcon(ea, direction, true)).toContain(exit);
    expect(getIcon.mock.calls).toEqual([[`lucide-${entrance}`], [`lucide-${exit}`]]);
  });

  it("uses the supplied fade-out SVG without a registry lookup", () => {
    const getIcon = vi.fn();
    const markup = getAnimationEditorIcon({ obsidian: { getIcon } } as unknown as ExcalidrawAutomate, "fade-out", true);
    expect(getIcon).not.toHaveBeenCalled();
    expect(markup).toContain('class="lucide lucide-circle-fading-minus preview-icon"');
    expect(markup).toContain('stroke="currentColor"');
    expect([...markup.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "M12 2a10 10 0 0 1 7.38 16.75", "M8 12h8", "M2.5 8.875a10 10 0 0 0-.5 3",
      "M2.83 16a10 10 0 0 0 2.43 3.4", "M4.636 5.235a10 10 0 0 1 .891-.857",
      "M8.644 21.42a10 10 0 0 0 7.631-.38",
    ]);
  });
});
