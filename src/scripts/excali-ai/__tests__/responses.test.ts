import { expect, it } from "vitest";
import {
  extractStructuredContent,
  getGeneratedImageSource,
  getResultFinishReason,
  isMaxTokenFinishReason,
} from "../responses";

it("extracts matching provider code blocks, SVG in HTML fences, and plain HTML without surrounding prose", () => {
  const blocks = [
    { type: "text", data: "first" },
    { type: "html", data: "<svg/>" },
  ];
  expect(extractStructuredContent("response", "svg", () => blocks)).toBe("<svg/>");
  expect(extractStructuredContent("response", "text", () => blocks)).toBe("first");
  expect(
    extractStructuredContent("Before <!DOCTYPE html><html>Result</html> after", "html", () => []),
  ).toBe("<!DOCTYPE html><html>Result</html>");
  expect(extractStructuredContent("mermaid graph TD; A-->B", "mermaid", () => [])).toBe(
    "graph TD; A-->B",
  );
  expect(extractStructuredContent("# Root\n- Child", "mindmap", () => [])).toBe("# Root\n- Child");
});
it("rejects empty or unstructured output and detects truncated model responses", () => {
  expect(extractStructuredContent(null, "html", () => [])).toBe("");
  expect(extractStructuredContent("unfinished html", "html", () => [])).toBe("");
  expect(
    isMaxTokenFinishReason(
      getResultFinishReason({ json: { choices: [{ finish_reason: "length" }] } }),
    ),
  ).toBe(true);
  expect(getResultFinishReason({ json: { choices: [{ finish_reason: 0 }] } })).toBe("");
  expect(isMaxTokenFinishReason("stop")).toBe(false);
});
it("normalizes data URLs and hosted images without depending on API credentials", () => {
  expect(
    getGeneratedImageSource({
      firstImage: {
        dataURL: "data:image/png;base64,AA==",
        url: "https://example.invalid/image.png",
      },
    }),
  ).toBe("data:image/png;base64,AA==");
  expect(getGeneratedImageSource({ images: [{ url: "https://example.invalid/image.png" }] })).toBe(
    "https://example.invalid/image.png",
  );
  expect(getGeneratedImageSource({ images: [] })).toBe(null);
});
