import { describe, expect, it } from "vitest";
import { formatMermaidNode, getMermaidMindmapBody, parseMermaidMindmap } from "../mermaid";

describe("Mermaid detection", () => {
  it.each([
    "mindmap\n  Root\n    Child",
    "\n```mermaid\nmindmap\n  Root\n    Child\n```\n",
    "~~~mermaid\r\nmindmap\r\n  Root\r\n    Child\r\n~~~",
    "````mermaid\nmindmap\n  Root\n    Child\n````",
  ])("recognizes a complete plain or fenced mindmap: %s", (text) => {
    expect(parseMermaidMindmap(text)).toEqual([
      { indent: 0, text: "Root", shape: null },
      { indent: 2, text: "Child", shape: null },
    ]);
  });

  it.each([
    "# Root\n- [[link]]\n- [alias](path)",
    "mindmapping\n  Child",
    "```mermaid\nflowchart TD\nA --> B\n```",
    "```text\nmindmap\n  Root\n```",
    "```mermaid\nmindmap\n  Root",
    "Here is your mindmap:\n```mermaid\nmindmap\n  Root\n```",
  ])("leaves non-mindmap input to the existing importer: %s", (text) => {
    expect(getMermaidMindmapBody(text)).toBeNull();
    expect(parseMermaidMindmap(text)).toBeNull();
  });
});

it("reads IDs, supported shapes, tabs, comments and decoration lines", () => {
  expect(
    parseMermaidMindmap(`mindmap
\troot(("Root"))
\t\trect[Rectangle]
\t\t  rounded(Rounded)
\t\t  diamond{Diamond}
\t\t  hex{{Hexagon}}
\t\t%% comment
\t\t::icon(fa fa-book)
\t\t:::urgent
\t\tBare node`),
  ).toEqual([
    { indent: 0, text: "Root", shape: "ellipse" },
    { indent: 4, text: "Rectangle", shape: "rectangle" },
    { indent: 6, text: "Rounded", shape: "ellipse" },
    { indent: 6, text: "Diamond", shape: "diamond" },
    { indent: 6, text: "Hexagon", shape: "diamond" },
    { indent: 4, text: "Bare node", shape: null },
  ]);
});

it("preserves wiki and Markdown links while recognizing standalone rectangle brackets", () => {
  const nodes = parseMermaidMindmap(`mindmap
Root
  [[Note|alias]]
  [alias](https://example.com)
  [Rectangle]
  n["[[Linked note]]"]`);
  expect(nodes?.slice(1)).toEqual([
    { indent: 2, text: "[[Note|alias]]", shape: null },
    { indent: 2, text: "[alias](https://example.com)", shape: null },
    { indent: 2, text: "Rectangle", shape: "rectangle" },
    { indent: 2, text: "[[Linked note]]", shape: "rectangle" },
  ]);
});

it.each(["mindmap", "mindmap\n  %% comment", "mindmap\nRoot\nOther root", 'mindmap\nroot[""]'])(
  "rejects invalid map structure before importing: %s",
  (text) => {
    expect(() => parseMermaidMindmap(text)).toThrow();
  },
);

it.each(["rectangle", "ellipse", "diamond", "text"])(
  "round-trips special labels in %s nodes",
  (shape) => {
    const text =
      'Quotes " and #quot; & [] () {} : %% ```\n[[Note|alias]] [alias](path) <br/> 中文 🌳';
    const line = formatMermaidNode(text, shape, 1);
    expect(line).not.toContain("```");
    expect(parseMermaidMindmap(`mindmap\n  ${line}`)).toEqual([
      { indent: 0, text, shape: shape === "text" ? null : shape },
    ]);
  },
);

it("uses Mermaid's supported circle and hexagon delimiters on export", () => {
  expect(formatMermaidNode("Circle", "ellipse", 1)).toBe('n1(("Circle"))');
  expect(formatMermaidNode("Diamond", "diamond", 2)).toBe('n2{{"Diamond"}}');
});

it("escapes the reserved mindmap token when it is an unboxed node label", () => {
  const label = formatMermaidNode("mindmap", "text", 1);
  expect(label).toBe("#109;indmap");
  expect(parseMermaidMindmap(`mindmap\n  ${label}`)?.[0]?.text).toBe("mindmap");
});
