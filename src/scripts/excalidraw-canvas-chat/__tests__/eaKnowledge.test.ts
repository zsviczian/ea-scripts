import { describe, expect, it } from "vitest";
import { extractKnowledgeSnippets, isAllowedKnowledgePath, normalizeKnowledgePath } from "../eaKnowledge";

describe("Canvas Chat EA knowledge retrieval", () => {
  it("allows canonical references and real example scripts only", () => {
    expect(isAllowedKnowledgePath("SKILL.md")).toBe(true);
    expect(isAllowedKnowledgePath("references/type-definitions.md")).toBe(true);
    expect(isAllowedKnowledgePath("references/scripts/Slideshow.js")).toBe(true);
    expect(isAllowedKnowledgePath("../README.md")).toBe(false);
    expect(isAllowedKnowledgePath("references/scripts/../../README.md")).toBe(false);
    expect(normalizeKnowledgePath("scripts/Printable%20Layout%20Wizard.js")).toBe("references/scripts/Printable Layout Wizard.js");
  });

  it("extracts focused context around a domain term", () => {
    const text = [
      "# Types",
      "unrelated",
      "type FrameRole = null | \"marker\";",
      "export type ExcalidrawFrameElement = {",
      "  frameRole?: FrameRole;",
      "}",
      "other content",
    ].join("\n");
    const result = extractKnowledgeSnippets(text, "marker frameRole", 2000);
    expect(result).toContain("FrameRole");
    expect(result).toContain("marker");
  });
});
