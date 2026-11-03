/** Portable source blocks use the same delimiters as Excalidraw drawing files. */
export interface LocalMarkdownImage {
  markdown: string;
  render?: Record<string, unknown>;
  width?: number;
}

export function isLocalMarkdownImage(element: {
  type: string;
  customData?: Record<string, unknown>;
}): boolean {
  const data = element.customData?.markdownImage;
  return (
    element.type === "image" &&
    !!data &&
    typeof data === "object" &&
    "source" in data &&
    data.source === "local"
  );
}

const referencePattern = /^!\[\[#\^markdown-image=([\w-]+)(?:\|(\d+))?\]\]$/;

/** Resolve only our reserved reference syntax, leaving ordinary embeds unchanged. */
export function resolveMarkdownImageReference(
  text: string,
  images: ReadonlyMap<string, LocalMarkdownImage>,
): LocalMarkdownImage | null {
  const match = text.match(referencePattern);
  if (!match) return null;
  const image = images.get(match[1]!);
  if (!image) throw new Error("Missing Markdown-image source");
  return { ...image, ...(match[2] ? { width: Number(match[2]) } : {}) };
}

/** Separate image bodies before the outline parser sees their headings, lists or code. */
export function parseMarkdownImageAppendix(text: string): {
  outline: string;
  images: Map<string, LocalMarkdownImage>;
} {
  const images = new Map<string, LocalMarkdownImage>();
  const renders = new Map<string, Record<string, unknown>>();
  let outline = text.replace(
    /^<!-- excalidraw-markdown-image:([\w-]+) -->\r?\n\r?\n([\s\S]*?)\r?\n\r?\n<!-- \/excalidraw-markdown-image:\1 -->[ \t]*(?:\r?\n)?/gm,
    (_block, id: string, markdown: string) => {
      if (images.has(id)) throw new Error("Duplicate Markdown-image source");
      images.set(id, { markdown });
      return "";
    },
  );
  outline = outline.replace(
    /^<!-- mindmap-markdown-image-render:([\w-]+) (.+) -->\r?\n?/gm,
    (_block, id: string, json: string) => {
      const render: unknown = JSON.parse(json);
      if (!render || typeof render !== "object" || Array.isArray(render) || renders.has(id))
        throw new Error("Invalid Markdown-image appearance");
      renders.set(id, render as Record<string, unknown>);
      return "";
    },
  );
  renders.forEach((render, id) => {
    const image = images.get(id);
    if (image) image.render = render;
  });
  if (
    /^<!-- \/?excalidraw-markdown-image:|^<!-- mindmap-markdown-image-render:/m.test(outline) ||
    [...renders.keys()].some((id) => !images.has(id))
  )
    throw new Error("Invalid Markdown-image appendix");
  // Missing references must fail before any scene mutation, including a partial import.
  for (const match of outline.matchAll(/!\[\[#\^markdown-image=[\w-]+(?:\|\d+)?\]\]/g))
    resolveMarkdownImageReference(match[0], images);
  return { outline, images };
}

/** Preserve source text exactly, including its leading/trailing blank lines. */
export function serializeMarkdownImageAppendix(
  images: ReadonlyMap<string, LocalMarkdownImage>,
): string {
  return [...images]
    .map(([id, image]) => {
      if (!/^[\w-]+$/.test(id) || /^<!-- \/?excalidraw-markdown-image:/m.test(image.markdown))
        throw new Error("Reserved Markdown-image delimiter");
      const appearance = image.render
        ? `<!-- mindmap-markdown-image-render:${id} ${JSON.stringify(image.render).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")} -->\n`
        : "";
      return `\n${appearance}<!-- excalidraw-markdown-image:${id} -->\n\n${image.markdown}\n\n<!-- /excalidraw-markdown-image:${id} -->\n`;
    })
    .join("");
}
