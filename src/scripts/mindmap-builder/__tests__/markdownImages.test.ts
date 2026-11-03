import { expect, it } from "vitest";
import {
  parseMarkdownImageAppendix,
  serializeMarkdownImageAppendix,
  resolveMarkdownImageReference,
} from "../markdownImages";

it("separates exact multiline Unicode source from the outline and retains appearance", () => {
  const markdown = "\n# Source 标题\n\n- inner list\n  - child\n```js\nconst x = 1;\n```\n\n";
  const render = { width: 480, css: "/* --> */", border: { enabled: true, color: "red" } };
  const images = new Map([["image_1", { markdown, render }]]);
  const text = "# Root\n- ![[#^markdown-image=image_1|240]]\n- Sibling\n";
  const serialized = serializeMarkdownImageAppendix(images);
  expect(serialized).toContain(`<!-- excalidraw-markdown-image:image_1 -->\n\n${  markdown}`);
  expect(serialized).toContain("\\u003e");
  const parsed = parseMarkdownImageAppendix(text + serialized);
  expect(parsed.outline.trimEnd()).toBe(text.trimEnd());
  expect(parsed.images).toEqual(images);
  expect(resolveMarkdownImageReference("![[#^markdown-image=image_1|240]]", parsed.images)).toEqual(
    { markdown, render, width: 240 },
  );
});

it("keeps headings, ordinary embeds and marker-like source comments out of parsing", () => {
  const markdown = '<!-- mindmap-markdown-image-render:example {"css":"body"} -->\n# Content';
  const appendix = serializeMarkdownImageAppendix(new Map([["id", { markdown }]]));
  expect(parseMarkdownImageAppendix(appendix).images.get("id")?.markdown).toBe(markdown);
  expect(resolveMarkdownImageReference("![[Note#Heading|300]]", new Map())).toBeNull();
  expect(parseMarkdownImageAppendix("# Root\n- [[Note]]").outline).toBe("# Root\n- [[Note]]");
});

it("rejects missing, duplicated and malformed source blocks before importing any nodes", () => {
  const block = serializeMarkdownImageAppendix(new Map([["id", { markdown: "body" }]]));
  expect(() => parseMarkdownImageAppendix("# Root\n- ![[#^markdown-image=missing|300]]")).toThrow();
  expect(() => parseMarkdownImageAppendix(block + block)).toThrow();
  expect(() =>
    parseMarkdownImageAppendix(
      block.replace("/excalidraw-markdown-image:id", "/excalidraw-markdown-image:other"),
    ),
  ).toThrow();
  expect(() =>
    parseMarkdownImageAppendix(`<!-- mindmap-markdown-image-render:id [] -->\n${  block}`),
  ).toThrow();
  expect(() =>
    serializeMarkdownImageAppendix(
      new Map([["id", { markdown: "<!-- excalidraw-markdown-image:nested -->" }]]),
    ),
  ).toThrow();
});

it("roundtrips empty source and Windows line endings", () => {
  const block = serializeMarkdownImageAppendix(new Map([["id", { markdown: "" }]])).replace(
    /\n/g,
    "\r\n",
  );
  expect(parseMarkdownImageAppendix(block).images.get("id")?.markdown).toBe("");
});
