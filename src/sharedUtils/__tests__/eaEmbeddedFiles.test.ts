/**
 * @file eaEmbeddedFiles.test.ts
 * @overview Tests preservation of image and equation payloads for staged EA elements.
 */

import { describe, expect, it, vi } from "vitest";

import { copyEmbeddedFilesToEa, type EaEmbeddedFileHost } from "../eaEmbeddedFiles";

function imageElement(fileId: string): ExcalidrawElement {
  return { type: "image", fileId } as unknown as ExcalidrawElement;
}

describe("copyEmbeddedFilesToEa", () => {
  it("copies linked image metadata and the image color map", () => {
    const getColorMapForImageElement = vi.fn(() => ({ black: "#111111" }));
    const ea = {
      targetView: {
        excalidrawData: {
          getFile: () => ({
            mimeType: "image/png",
            img: "data:image/png;base64,abc",
            mtime: 42,
            file: { path: "Assets/image.png" },
            hyperlink: undefined,
            isSVGwithBitmap: false,
          }),
          getEquation: () => null,
        },
        getScene: () => ({ files: {} }),
      },
      imagesDict: {},
      getColorMapForImageElement,
    } as unknown as EaEmbeddedFileHost;

    copyEmbeddedFilesToEa(ea, [imageElement("image-1")]);

    expect(ea.imagesDict["image-1"]).toMatchObject({
      mimeType: "image/png",
      dataURL: "data:image/png;base64,abc",
      created: 42,
      file: "Assets/image.png",
      latex: null,
    });
    expect(getColorMapForImageElement).toHaveBeenCalledOnce();
  });

  it("falls back to equation scene data when no ordinary image file is available", () => {
    const ea = {
      targetView: {
        excalidrawData: {
          getFile: () => null,
          getEquation: () => ({ latex: "x^2" }),
        },
        getScene: () => ({
          files: {
            "equation-1": {
              mimeType: "image/svg+xml",
              dataURL: "data:image/svg+xml;base64,abc",
              created: 7,
            },
          },
        }),
      },
      imagesDict: {},
      getColorMapForImageElement: vi.fn(),
    } as unknown as EaEmbeddedFileHost;

    copyEmbeddedFilesToEa(ea, [imageElement("equation-1")]);

    expect(ea.imagesDict["equation-1"]).toMatchObject({
      mimeType: "image/svg+xml",
      dataURL: "data:image/svg+xml;base64,abc",
      created: 7,
      file: null,
      hasSVGwithBitmap: null,
      latex: "x^2",
    });
  });
});
