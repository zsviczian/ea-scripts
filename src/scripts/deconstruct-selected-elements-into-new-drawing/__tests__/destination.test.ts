/**
 * @file destination.test.ts
 * @overview Tests destination validation and localized validation messages.
 */

import { describe, expect, it } from "vitest";

import {
  formatDestinationValidationError,
  validateDeconstructionDestination,
} from "../destination";
import { createDeconstructTranslator } from "../lang";

const t = createDeconstructTranslator("en");

describe("deconstruction destination", () => {
  it("adds the Markdown extension to a valid filename", () => {
    expect(validateDeconstructionDestination("Parts/Reusable", "diagram")).toEqual({
      valid: true,
      folderPath: "Parts/Reusable",
      fileName: "diagram.md",
    });
  });

  it("preserves an existing Markdown extension case-insensitively", () => {
    expect(validateDeconstructionDestination("", "diagram.MD")).toEqual({
      valid: true,
      folderPath: "",
      fileName: "diagram.MD",
    });
  });

  it("normalizes the vault root for EA file creation", () => {
    expect(validateDeconstructionDestination("/", "diagram")).toEqual({
      valid: true,
      folderPath: "",
      fileName: "diagram.md",
    });
  });

  it("rejects invalid filename characters with a concrete notice", () => {
    const result = validateDeconstructionDestination("Parts", "bad?.md");
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.field).toBe("file");
    expect(formatDestinationValidationError(t, result)).toBe(
      'File name contains an invalid character: "?".',
    );
  });

  it("rejects invalid folder characters with a concrete notice", () => {
    const result = validateDeconstructionDestination("Parts/Bad\\Folder", "diagram.md");
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.field).toBe("folder");
    expect(formatDestinationValidationError(t, result)).toBe(
      'Folder path contains an invalid character: "\\".',
    );
  });
});
