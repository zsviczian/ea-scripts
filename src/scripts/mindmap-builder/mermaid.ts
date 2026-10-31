/** @file Import-safe Mermaid mindmap outline parsing and label serialization. */

export type MermaidNodeShape = "rectangle" | "ellipse" | "diamond";

export interface MermaidOutlineNode {
  indent: number;
  text: string;
  shape: MermaidNodeShape | null;
}

/** Detects a whole Mermaid mindmap, with an optional Markdown code fence. */
export function getMermaidMindmapBody(text: string): string | null {
  let body = text.trim();
  const fence = body.match(/^(`{3,}|~{3,})mermaid[^\S\r\n]*\r?\n/i);
  if (fence) {
    const marker = fence[1]!;
    const closing = new RegExp(`\\r?\\n[ \\t]*${marker[0]}{${marker.length},}[ \\t]*$`);
    if (!closing.test(body)) return null;
    body = body.slice(fence[0].length).replace(closing, "").trim();
  }
  return /^mindmap(?:[^\S\r\n]*)(?:\r?\n|$)/.test(body) ? body : null;
}

/** Restores line breaks and entities without reinterpreting escaped literal HTML. */
function decodeLabel(label: string): string {
  let text = label.trim();
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
  if (text.startsWith("`") && text.endsWith("`")) text = text.slice(1, -1);
  return text.replace(/<br\s*\/?\s*>/gi, "\n").replace(/#(quot|\d+);/g, (entity, value: string) => {
    if (value === "quot") return '"';
    const code = Number(value);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** Reads shape syntax only inside a detected Mermaid document; links stay literal. */
function parseNodeLabel(label: string): Pick<MermaidOutlineNode, "text" | "shape"> {
  if (/^!?\[\[.*\]\]$/.test(label) || /^!?\[.*\]\(.*\)$/.test(label)) {
    return { text: label, shape: null };
  }
  const match = label.match(/^(?:[\w-]+\s*)?(\(\(|\{\{|\[|\(|\{)([\s\S]*)$/u);
  const endings: Record<string, string> = { "((": "))", "{{": "}}", "[": "]", "(": ")", "{": "}" };
  if (match) {
    const opening = match[1]!;
    const content = match[2]!;
    const ending = endings[opening]!;
    if (content.endsWith(ending)) {
      const shape = opening.startsWith("(")
        ? "ellipse"
        : opening.startsWith("{")
          ? "diamond"
          : "rectangle";
      return { text: decodeLabel(content.slice(0, -ending.length)), shape };
    }
  }
  return { text: decodeLabel(label), shape: null };
}

/** Returns null for ordinary Markdown; rejects an empty map or multiple roots before mutation. */
export function parseMermaidMindmap(text: string): MermaidOutlineNode[] | null {
  const body = getMermaidMindmapBody(text);
  if (body === null) return null;
  const nodes: MermaidOutlineNode[] = [];
  for (const line of body.split(/\r\n|\n|\r/).slice(1)) {
    const label = line.trim();
    if (!label || /^(?:%%|::icon\(|:::)/.test(label)) continue;
    const indent = line.match(/^[ \t]*/)![0].replace(/\t/g, "    ").length;
    const node = { indent, ...parseNodeLabel(label) };
    if (!node.text.trim() || (nodes.length > 0 && indent <= nodes[0]!.indent)) {
      throw new Error("Invalid Mermaid mindmap hierarchy");
    }
    nodes.push(node);
  }
  if (nodes.length === 0) throw new Error("Empty Mermaid mindmap");
  const rootIndent = nodes[0]!.indent;
  return nodes.map((node) => ({ ...node, indent: node.indent - rootIndent }));
}

/** Keeps labels on one line and prevents text, links or fence markers becoming Mermaid syntax. */
export function formatMermaidNode(text: string, shape: string, index: number): string {
  let label = text.replace(/[#&"<>\[\](){}:`%\r\n]/g, (char) => {
    if (char === "\r") return "";
    return char === "\n" ? "<br/>" : `#${char.codePointAt(0)!};`;
  });
  const delimiters: Record<string, [string, string]> = {
    rectangle: ["[", "]"],
    ellipse: ["((", "))"],
    diamond: ["{{", "}}"],
  };
  const pair = delimiters[shape];
  // This exact bare label is a reserved token even after the document header.
  if (!pair && /^mindmap$/i.test(label)) label = `#${label.charCodeAt(0)};${label.slice(1)}`;
  return pair ? `n${index}${pair[0]}"${label}"${pair[1]}` : label;
}
