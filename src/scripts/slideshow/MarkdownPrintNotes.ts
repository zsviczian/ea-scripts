import { getPrintColors, type PrintBox, type PrintTheme } from "./printLayout";

interface Boundary {
  node: Node;
  offset: number;
}

/** Collects text boundaries and treats embedded graphics as indivisible items. */
function getBoundaries(root: HTMLElement): Boundary[] {
  const boundaries: Boundary[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      let offset = 0;
      for (const character of node.textContent ?? "") {
        offset += character.length;
        boundaries.push({ node, offset });
      }
    } else if (
      node.nodeType === 1 &&
      (node as Element).matches("img, svg, canvas, video, iframe, hr, br, input")
    ) {
      const parent = node.parentNode!;
      boundaries.push({
        node: parent,
        offset: Array.from(parent.childNodes).indexOf(node as ChildNode) + 1,
      });
    } else {
      for (const child of Array.from(node.childNodes)) visit(child);
    }
  };
  visit(root);
  boundaries.push({ node: root, offset: root.childNodes.length });
  return boundaries;
}

/** Gives rendered Markdown a readable, theme-independent print appearance. */
function styleNotes(root: HTMLElement, box: PrintBox, theme: PrintTheme): void {
  const colors = getPrintColors(theme);
  root.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
  root.setCssStyles({
    width: `${box.width}px`,
    margin: "0",
    padding: "0",
    border: "0",
    font: "14px/20px Arial, sans-serif",
    color: colors.foreground,
    backgroundColor: colors.background,
    overflowWrap: "anywhere",
    boxSizing: "border-box",
    minHeight: "0",
  });
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    element.setCssStyles({ maxWidth: "100%", boxSizing: "border-box", color: colors.foreground });
    if (element.matches("p, ul, ol, blockquote, pre, table"))
      element.setCssStyles({ marginTop: "0", marginBottom: "6px" });
    if (element.matches("h1, h2, h3, h4, h5, h6"))
      element.setCssStyles({
        fontSize: `${Math.min(22, box.height / 2)}px`,
        lineHeight: "1.2",
        margin: "0 0 6px",
      });
    if (element.matches("ul, ol")) element.setCssStyles({ paddingLeft: "24px" });
    if (element.matches("pre, code"))
      element.setCssStyles({ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "12px" });
    if (element.matches("img, svg, canvas, video, iframe"))
      element.setCssStyles({ maxHeight: `${box.height}px`, objectFit: "contain" });
    if (element.matches("table"))
      element.setCssStyles({ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" });
    if (element.matches("th, td"))
      element.setCssStyles({
        border: `1px solid ${colors.border}`,
        padding: "3px",
        whiteSpace: "normal",
      });
  }
}

/** Renders notes through Obsidian and paginates the HTML by measured text boundaries. */
export async function renderPrintNotes(
  ea: ExcalidrawAutomate,
  notes: string,
  sourcePath: string,
  box: PrintBox,
  ownerDocument: Document,
  theme: PrintTheme = "light",
): Promise<HTMLElement[]> {
  const host = ownerDocument.body.createDiv();
  host.setCssStyles({
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    width: `${box.width}px`,
    pointerEvents: "none",
  });
  const root = host.createDiv({ cls: "markdown-rendered" });
  const component = new ea.obsidian.Component();
  component.load();
  try {
    await ea.obsidian.MarkdownRenderer.render(app, notes, root, sourcePath, component);
    await Promise.all(
      Array.from(root.querySelectorAll("img"), async (image) => {
        const win = ownerDocument.defaultView!;
        let timer = 0;
        try {
          await Promise.race([
            image.decode().catch(() => undefined),
            new Promise<void>((resolve) => {
              timer = win.setTimeout(resolve, 3000);
            }),
          ]);
        } finally {
          win.clearTimeout(timer);
        }
      }),
    );
    styleNotes(root, box, theme);
    const boundaries = getBoundaries(root);
    const pages: HTMLElement[] = [];
    let start: Boundary = { node: root, offset: 0 };
    let first = 0;
    while (first < boundaries.length) {
      const slice = (end: Boundary): HTMLElement => {
        const range = ownerDocument.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        const clone = root.cloneNode(false) as HTMLElement;
        clone.appendChild(range.cloneContents());
        return clone;
      };
      const fits = (end: number): boolean => {
        const candidate = slice(boundaries[end]!);
        host.appendChild(candidate);
        const height = candidate.getBoundingClientRect().height;
        candidate.remove();
        return height <= box.height;
      };
      let low = first;
      let high = boundaries.length - 1;
      let last = first - 1;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (fits(middle)) {
          last = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
      // Prefer a whole word at continuation boundaries; retain character fallback for long words.
      let wordEnd = last;
      while (wordEnd > first) {
        const boundary = boundaries[wordEnd]!;
        const text = boundary.node.textContent ?? "";
        if (
          boundary.node.nodeType !== 3 ||
          boundary.offset === text.length ||
          /\s/.test(text[boundary.offset - 1] ?? "") ||
          /\s/.test(text[boundary.offset] ?? "")
        )
          break;
        wordEnd -= 1;
      }
      if (wordEnd > first) last = wordEnd;
      // A single tall item still gets its own slot, scaled to fit rather than clipped.
      last = Math.max(first, last);
      const chunk = slice(boundaries[last]!);
      host.appendChild(chunk);
      const height = chunk.getBoundingClientRect().height;
      chunk.remove();
      if (height > box.height) {
        chunk.setCssStyles({
          transform: `scale(${box.height / height})`,
          transformOrigin: "top left",
        });
      }
      pages.push(chunk);
      start = boundaries[last]!;
      first = last + 1;
    }
    return pages;
  } finally {
    component.unload();
    host.remove();
  }
}

/** Embeds real XHTML notes in a vector SVG page for Chromium's native PDF renderer. */
export function appendPrintNotes(page: SVGSVGElement, notes: HTMLElement, box: PrintBox): void {
  const foreignObject = page.createSvg("foreignObject", {
    attr: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
  });
  notes.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  foreignObject.appendChild(notes);
}
