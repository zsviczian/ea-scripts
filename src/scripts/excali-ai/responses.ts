/** Minimal normalized provider results consumed by ExcaliAI. */
export interface ExcaliAIResult {
  firstImage?: { dataURL?: string; url?: string } | null;
  images?: { dataURL?: string; url?: string }[];
  json?: { choices?: { finish_reason?: unknown }[] };
}

/** Finds the first usable normalized image while retaining data-URL preference. */
export function getGeneratedImageSource(result?: ExcaliAIResult | null): string | null {
  return (
    result?.firstImage?.dataURL ||
    result?.firstImage?.url ||
    result?.images?.[0]?.dataURL ||
    result?.images?.[0]?.url ||
    null
  );
}

/** Reads the OpenAI-shaped finish reason shared by all normalized text providers. */
export function getResultFinishReason(result?: ExcaliAIResult | null): string {
  const reason = result?.json?.choices?.[0]?.finish_reason;
  return typeof reason === "string" ? reason : "";
}

/** Recognizes provider token-limit responses so truncated HTML gets an actionable message. */
export function isMaxTokenFinishReason(reason: string): boolean {
  return ["max_tokens", "max_tokens_exceeded", "length"].includes(reason.trim().toLowerCase());
}

/** Extracts a task result using the Script Engine's code-block parser. */
export function extractStructuredContent(
  rawContent: string | null | undefined,
  blocktype: string,
  extractCodeBlocks: (text: string) => { type?: string; data?: string }[],
): string {
  const content = (rawContent ?? "").trim();
  if (!content) return "";
  const blocks = extractCodeBlocks(content);
  const matching =
    blocks.find((block) => (block.type ?? "").toLowerCase() === blocktype) ||
    (blocktype === "svg"
      ? blocks.find((block) => (block.type ?? "").toLowerCase() === "html")
      : undefined) ||
    blocks[0];
  if (matching?.data) return matching.data;
  if (blocktype === "html") {
    const doctype = content.indexOf("<!DOCTYPE html>"),
      html = content.indexOf("<html");
    const start = doctype >= 0 ? doctype : html,
      end = content.lastIndexOf("</html>");
    if (start >= 0 && end >= 0) return content.slice(start, end + "</html>".length);
  }
  if (blocktype === "mermaid" && content.startsWith("mermaid"))
    return content.replace(/^mermaid/, "").trim();
  if (blocktype === "mindmap") return content;
  return "";
}
