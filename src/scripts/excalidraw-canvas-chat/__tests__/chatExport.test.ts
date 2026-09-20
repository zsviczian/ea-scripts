import { describe, expect, it } from "vitest";
import { chatThreadToMarkdown } from "../chatExport";
import type { ChatThread } from "../types";

describe("Canvas Chat markdown export", () => {
  it("exports the current thread with stable role headings", () => {
    const thread: ChatThread = {
      id: "chat-1",
      title: "Frame this diagram",
      createdAt: "2026-09-19T10:00:00Z",
      updatedAt: "2026-09-19T10:02:00Z",
      messages: [
        { id: "1", role: "user", content: "Add a frame.", createdAt: "2026-09-19T10:01:00Z" },
        { id: "2", role: "assistant", content: "Done.", createdAt: "2026-09-19T10:02:00Z" },
      ],
    };
    expect(chatThreadToMarkdown(thread)).toBe(
      "# Frame this diagram\n\n## You\n\nAdd a frame.\n\n## Canvas Chat\n\nDone.\n",
    );
  });
});
