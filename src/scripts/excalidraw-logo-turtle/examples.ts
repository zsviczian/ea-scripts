/**
 * @file examples.ts
 * @overview Built-in Logo examples shown in the Turtle sidepanel.
 */

export interface LogoExample {
  id: "rainbow" | "tree" | "flower" | "stars" | "sierpinski";
  source: string;
}

export const LOGO_EXAMPLES: readonly LogoExample[] = [
  {
    id: "rainbow",
    source: `; Rainbow spiral\nmake "step 6\nrepeat 72 [\n  setpencolor ifelsevalue (repcount % 3) = 0 "#e03131 ifelsevalue (repcount % 3) = 1 "#1971c2 "#2f9e44\n  fd :step + repcount * 1.5\n  rt 91\n]`,
  },
  {
    id: "tree",
    source: `; Recursive tree\nto tree :size\n  if :size < 8 [stop]\n  fd :size\n  lt 28\n  tree :size * 0.72\n  rt 56\n  tree :size * 0.72\n  lt 28\n  bk :size\nend\n\nsetpencolor "#2b8a3e\nsetpensize 2\nlt 90\ntree 90`,
  },
  {
    id: "flower",
    source: `; Flower\nto petal :radius\n  beginfill\n  repeat 18 [fd :radius / 9 rt 10]\n  rt 80\n  repeat 18 [fd :radius / 9 rt 10]\n  rt 80\n  endfill\nend\n\nsetpencolor "#d6336c\nsetfillcolor "#fcc2d7\nrepeat 12 [\n  petal 90\n  rt 30\n]\nsetpencolor "#f08c00\nsetfillcolor "#ffe066\nbeginfill\nrepeat 36 [fd 4 rt 10]\nendfill`,
  },
  {
    id: "stars",
    source: `; Star field\nto star :size\n  repeat 5 [fd :size rt 144]\nend\n\nrepeat 18 [\n  pu\n  setxy (random 360) - 180 (random 240) - 120\n  pd\n  setpensize 1 + (random 3)\n  star 12 + (random 22)\n]\npu\nsetxy -80 -155\npd\nsetfontsize 20\nlabel [Made with Logo Turtle]`,
  },
  {
    id: "sierpinski",
    source: `; Sierpinski triangle\nto sierpinski :size :depth\n  if :depth = 0 [\n    repeat 3 [fd :size rt 120]\n    stop\n  ]\n  sierpinski :size / 2 :depth - 1\n  fd :size / 2\n  sierpinski :size / 2 :depth - 1\n  bk :size / 2\n  rt 60\n  fd :size / 2\n  lt 60\n  sierpinski :size / 2 :depth - 1\n  rt 60\n  bk :size / 2\n  lt 60\nend\n\nsierpinski 260 4`,
  },
];

export const DEFAULT_LOGO_SOURCE = LOGO_EXAMPLES[0]!.source;
