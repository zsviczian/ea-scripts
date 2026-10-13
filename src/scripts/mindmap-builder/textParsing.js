/**
 * @file textParsing.js
 * @overview text Parsing implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createTextParsing(runtimeContext) {
  //special trim function that returns trimmed text, including trimming a bullet point of the bullet
  const trimText = (text) => {
    if (!text) return text;
    return text.match(/^(?:[ \t]*[-\*][ \t])?(?:[ \t]*)(.*?)[ \t]*$/)[1];
  };

  const parseText = async (text) => {
    const trimmed = trimText(text);
    if (
      trimmed &&
      (trimmed.startsWith("![[") || trimmed.match(/^[-*][ \t]+!\[\[/)) &&
      trimmed.endsWith("]]")
    ) {
      return text;
    }
    return await runtimeContext.ea.parseText(text);
  };

  const parseImageInput = (input) => {
    const trimmed = trimText(input);
    // Check for external/local markdown image link: ![](http...) or ![](file...)
    const externalMatch = trimmed.match(/^!\[(.*?)\]\(((?:https?|file):\/\/[^)]+)\)$/i);
    if (externalMatch) {
      const altText = externalMatch[1];
      const url = externalMatch[2];
      let width = null;
      if (altText) {
        const parts = altText.split("|");
        const last = parts[parts.length - 1];
        if (/^\d+$/.test(last)) {
          width = parseInt(last);
        }
      }
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        // Heuristic: check if the URL points to a standard image file extension
        const isImageUrl = runtimeContext.IMAGE_TYPES.some((ext) => pathname.endsWith("." + ext));
        if (isImageUrl) {
          return {
            path: url,
            width,
            imageFile: null,
            isImagePath: true, // This triggers image addition in addNode
            file: null,
            isExternalImage: true, // Flag to help direct link assignments later
          };
        }
      } catch (e) {}
      // If not matching an image extension, return null so parseEmbeddableInput takes over
      return null;
    }
    if (!trimmed.startsWith("![[") || !trimmed.endsWith("]]")) return null;
    const content = trimmed.slice(3, -2);
    const parts = content.split("|");
    const path = parts[0];
    let width = null;
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        width = parseInt(last);
      }
    }
    let imageFile = null,
      file = null;
    let isImagePath = false;
    const PDF_RECT_LINK_REGEX = /^[^#]*#page=\d*/; //(&\w*=[^&]+){0,}&rect=\d*,\d*,\d*,\d*
    if (path.match(PDF_RECT_LINK_REGEX)) {
      isImagePath = true;
    } else {
      const pathParts = path.split("#");
      imageFile = file = app.metadataCache.getFirstLinkpathDest(
        pathParts[0],
        runtimeContext.ea.targetView.file.path,
      );
      if (imageFile) {
        const isEx = imageFile.extension === "md" && runtimeContext.ea.isExcalidrawFile(imageFile);
        if (!runtimeContext.IMAGE_TYPES.includes(imageFile.extension.toLowerCase()) && !isEx) {
          // Treat standard markdown files with an explicit width as an image path
          if (file.extension === "md" && width !== null) {
            isImagePath = true;
          }
          imageFile = null;
        }
        if (isEx && pathParts.length === 2) {
          isImagePath = true;
          imageFile = null;
        }
      }
    }
    return {
      path,
      width,
      imageFile,
      isImagePath,
      file,
    };
  };

  const parseEmbeddableInput = (input, imageInfo) => {
    const trimmed = input.trim();
    // Ensure we capture potential alt-text formatting so we gracefully match the pattern
    const match = trimmed.match(/^!\[(.*?)\]\(((?:https?|file):\/\/[^)]+)\)$/i);
    if (match) {
      // If parseImageInput already claimed this as an external image, do not override
      if (imageInfo && imageInfo.isExternalImage) return null;
      return match[2];
    }
    const dataURL = trimmed.match(/^!\[\[(data:text\/html;base64.*)]]$/i);
    if (dataURL) {
      return dataURL[1];
    }
    // If parseImageInput already claimed this as an image path (e.g. markdown with width), don't convert to embeddable
    if (imageInfo && imageInfo.isImagePath && imageInfo.width !== null) {
      return null;
    }
    const pathSplit = imageInfo?.path?.split("#");
    if (
      imageInfo &&
      imageInfo.file &&
      imageInfo.file.extension === "md" &&
      // Not an Excalidraw File or maybe an Excalidraw file with a back-of-the-card note reference
      (!runtimeContext.ea.isExcalidrawFile(imageInfo.file) ||
        (pathSplit?.[1] && !pathSplit[1].startsWith("^")))
    ) {
      imageInfo.isImagePath = false;
      return `[[${imageInfo.path}]]`;
    }
    return null;
  };

  const getAdjustedMaxWidth = async (text, max) => {
    const fontString = `${runtimeContext.ea.style.fontSize.toString()}px ${ExcalidrawLib.getFontFamilyString({ fontFamily: runtimeContext.ea.style.fontFamily })}`;
    const parsedText = (await parseText(text)) ?? text;
    const wrappedText = ExcalidrawLib.wrapText(parsedText, fontString, max);
    const metrics = runtimeContext.ea.measureText(wrappedText);
    const optimalWidth = Math.ceil(metrics.width);
    return {
      width: Math.min(max, optimalWidth),
      height: metrics.height,
      wrappedText,
    };
  };

  // ---------------------------------------------------------------------------
  // 5. Copy & Paste Engine
  // ---------------------------------------------------------------------------
  /**
   * Checks if a node text contains exactly one wiki link to a markdown file and returns that TFile.
   */
  const getNodeMarkdownFile = (nodeText) => {
    if (!nodeText || !runtimeContext.ea.targetView || !runtimeContext.ea.targetView.file)
      return null;
    // Match [[filename]] or [[filename|alias]] that takes up the whole string
    const parts = nodeText.trim().match(/^\[\[([^#\|\]]+)[^\]]*]]$/);
    if (!!parts?.[1]) {
      const file = app.metadataCache.getFirstLinkpathDest(
        parts[1],
        runtimeContext.ea.targetView.file.path,
      );
      return file && file.extension === "md" ? file : null;
    }
    return null;
  };

  /**
// Extracts text from a node, handling text elements, images, and embeddables.
**/
  const getTextFromNode = (all, node, getRaw = false, shortPath = false) => {
    if (node.type === "embeddable") {
      return node.link.startsWith("[[") ? `!${node.link}` : `![](${node.link})`;
    }
    if (node.type === "image") {
      const embeddedFile = runtimeContext.ea.targetView?.excalidrawData?.getFile(node.fileId);
      if (!embeddedFile) return "";
      const file = runtimeContext.ea.getViewFileForImageElement(node);
      // Handle external image URLs or local file URIs saved in node.link
      if (!file && node.link && node.link.match(/^(https?|file):\/\//i)) {
        return `![image|${Math.round(node.width)}](${node.link})`;
      }
      if (shortPath) {
        const originalPath = embeddedFile.linkParts?.original;
        return `![[${originalPath}|${Math.round(node.width)}]]`;
      }
      if (file) {
        if (file.extension === "pdf" && node.link?.startsWith("[[")) {
          return `!${node.link.match(/^(.*?)\]\]/)[1]}|${Math.round(node.width)}]]`;
        }
        return `![[${file.path}${embeddedFile.filenameparts?.linkpartReference || ""}|${Math.round(node.width)}]]`;
      }
      return "";
    }
    if (node.type === "text") {
      return getRaw ? node.rawText : node.originalText;
    }
    const textId = node.boundElements?.find((be) => be.type === "text")?.id;
    if (!textId) return "";
    const textEl = all.find((el) => el.id === textId);
    return textEl ? (getRaw ? textEl.rawText : textEl.originalText) : "";
  };
  return {
    trimText,
    parseText,
    parseImageInput,
    parseEmbeddableInput,
    getAdjustedMaxWidth,
    getNodeMarkdownFile,
    getTextFromNode,
  };
}
