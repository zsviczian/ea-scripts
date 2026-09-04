/**
 * @file vaultPaths.test.ts
 * @overview Focused coverage for portable vault path validation and folder suggestion ranking.
 */

import { describe, expect, it } from "vitest";

import {
  formatVaultInvalidCharacter,
  getUniqueVaultFilePath,
  isVaultRootFolderPath,
  rankVaultFolderSuggestions,
  validateVaultFileName,
  validateVaultFolderPath,
} from "../vaultPaths";

describe("vaultPaths", () => {
  it("accepts ordinary filenames and nested folder paths", () => {
    expect(validateVaultFileName("deconstructed.md")).toEqual({ valid: true });
    expect(validateVaultFolderPath("Projects/Reusable Parts")).toEqual({ valid: true });
    expect(validateVaultFolderPath("")).toEqual({ valid: true });
    expect(validateVaultFolderPath("/")).toEqual({ valid: true });
  });

  it.each(["\\", "/", ":", "*", "?", '"', "<", ">", "|"])(
    "rejects %s in filenames",
    (character) => {
      const result = validateVaultFileName(`bad${character}name.md`);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("invalid-character");
        expect(result.character).toBe(character);
      }
    },
  );

  it("rejects invalid characters in individual folder names while preserving slash separators", () => {
    const result = validateVaultFolderPath("Projects/Bad?Folder/Nested");
    expect(result).toMatchObject({
      valid: false,
      reason: "invalid-character",
      segment: "Bad?Folder",
      character: "?",
    });
  });

  it("rejects unsafe path shapes and portable reserved names", () => {
    expect(validateVaultFolderPath("/Projects")).toMatchObject({
      valid: false,
      reason: "invalid-path-shape",
    });
    expect(validateVaultFolderPath("Projects//Parts")).toMatchObject({
      valid: false,
      reason: "invalid-path-shape",
    });
    expect(validateVaultFileName("CON.md")).toMatchObject({
      valid: false,
      reason: "reserved-name",
    });
    expect(validateVaultFolderPath("Projects/..")).toMatchObject({
      valid: false,
      reason: "dot-segment",
    });
  });

  it("recognizes both supported vault-root folder markers", () => {
    expect(isVaultRootFolderPath("")).toBe(true);
    expect(isVaultRootFolderPath("/")).toBe(true);
    expect(isVaultRootFolderPath("Excalidraw")).toBe(false);
  });

  it("builds unique vault-root paths without delegating root resolution", () => {
    const existing = new Set(["deconstructed.md", "deconstructed 1.md"]);
    expect(getUniqueVaultFilePath("/", "deconstructed.md", (path) => existing.has(path))).toBe(
      "deconstructed 2.md",
    );
    expect(getUniqueVaultFilePath("", "fresh.md", (path) => existing.has(path))).toBe("fresh.md");
  });

  it("formats control characters for readable notices", () => {
    expect(formatVaultInvalidCharacter("\n")).toBe("U+000A");
    expect(formatVaultInvalidCharacter("?")).toBe("?");
  });

  it("ranks prefix matches before nested substring matches", () => {
    expect(
      rankVaultFolderSuggestions(
        ["Hobbies/Projects", "Projects/Zeta", "Projects/Alpha", "Other", "Projects/Alpha"],
        "projects",
      ),
    ).toEqual(["Projects/Alpha", "Projects/Zeta", "Hobbies/Projects"]);
  });
});
