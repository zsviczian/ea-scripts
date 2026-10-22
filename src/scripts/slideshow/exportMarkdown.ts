import type { SlideDeck } from "./SlideDeck";
import type { SlideshowViewContext } from "./slideshowRuntime";

/** Resolves a filename in the drawing's folder; exports never overwrite an existing note. */
export function getMarkdownExportPath(drawingPath: string, filename: string): string | null {
  const name = filename.trim().replace(/\.md$/i, "");
  if (!name || /^\.+$/.test(name) || /[\\/:*?"<>|#\[\]\r\n]/.test(name) || /[. ]$/.test(name))
    return null;
  const folder = drawingPath.slice(0, Math.max(0, drawingPath.lastIndexOf("/") + 1));
  return `${folder}${name}.md`;
}

/** Serializes the complete ordered frame deck, using IDs only for ambiguous/unlinkable names. */
export function buildSlideshowMarkdown(
  drawingPath: string,
  deck: SlideDeck,
  frames: readonly { id: string; name: string | null }[],
): string {
  return (
    deck.slides
      .filter((slide) => slide.kind === "frame")
      .map((slide) => {
        const frame = frames.find((candidate) => candidate.id === slide.frameId);
        const name = frame?.name;
        const unique =
          name &&
          frames.filter((candidate) => candidate.name === name || candidate.id === name).length ===
            1;
        const target =
          unique && !/[|#\^\[\]\r\n]/.test(name) && !/,padding=\d/.test(name)
            ? name
            : slide.frameId;
        const heading = slide.title.replace(/[\r\n]+/g, " ").replace(/([\\`*_{}\[\]<>#])/g, "\\$1");
        return `## ${heading}\n\n![[${drawingPath}#^frame=${target}]]\n\n${slide.notes ?? ""}`.trimEnd();
      })
      .join("\n\n") + "\n"
  );
}

/** Prompts for a new note filename, writes the frame handout, and opens it in a new tab. */
export async function exportSlideshowMarkdown(
  context: SlideshowViewContext,
  deck: SlideDeck,
): Promise<void> {
  const { ea, view, utils, t } = context;
  const drawing = view.file;
  if (view.isDirty()) await view.forceSave(true);
  if (view.file !== drawing) return;
  const frames = ea.getViewElements().filter((element) => element.type === "frame");
  const markdown = buildSlideshowMarkdown(drawing.path, deck, frames);
  // The Script Engine rejects cancelled prompts; cancellation is not an export failure.
  const filename = await utils
    .inputPrompt(
      t("exportMarkdownFilename"),
      "",
      t("exportMarkdownDefaultFilename", { name: drawing.basename }),
    )
    .catch((error: unknown) => {
      if (error === "No input given.") return undefined;
      throw error;
    });
  if (filename === undefined) return;
  const path = getMarkdownExportPath(drawing.path, filename);
  if (!path) {
    new ea.obsidian.Notice(t("exportMarkdownInvalidFilename"));
    return;
  }
  if (app.vault.getFileByPath(path)) {
    new ea.obsidian.Notice(t("exportMarkdownExists"));
    return;
  }
  const file = await app.vault.create(path, markdown);
  await app.workspace.getLeaf("tab").openFile(file);
}
