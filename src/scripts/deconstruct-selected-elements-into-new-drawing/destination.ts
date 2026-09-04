/**
 * @file destination.ts
 * @overview Validates user-entered destination names before a deconstructed drawing is created.
 */

import {
  validateVaultFileName,
  validateVaultFolderPath,
  formatVaultInvalidCharacter,
  type VaultNameValidationResult,
} from "../../sharedUtils/vaultPaths";
import type { DeconstructTranslator } from "./lang";

export type DestinationValidationResult =
  | {
      valid: true;
      folderPath: string;
      fileName: string;
    }
  | {
      valid: false;
      field: "file" | "folder";
      validation: VaultNameValidationResult & { valid: false };
    };

/** Ensures the destination has a portable folder path and Markdown filename. */
export function validateDeconstructionDestination(
  folderPath: string,
  fileName: string,
): DestinationValidationResult {
  const fileValidation = validateVaultFileName(fileName);
  if (!fileValidation.valid) {
    return { valid: false, field: "file", validation: fileValidation };
  }
  const folderValidation = validateVaultFolderPath(folderPath);
  if (!folderValidation.valid) {
    return { valid: false, field: "folder", validation: folderValidation };
  }
  return {
    valid: true,
    folderPath: folderPath === "/" ? "" : folderPath,
    fileName: fileName.toLowerCase().endsWith(".md") ? fileName : `${fileName}.md`,
  };
}

/** Converts a destination validation failure into a localized user-facing message. */
export function formatDestinationValidationError(
  t: DeconstructTranslator,
  result: DestinationValidationResult & { valid: false },
): string {
  const { validation } = result;
  if (result.field === "file" && validation.reason === "empty") {
    return t("filenameRequired");
  }
  if (validation.reason === "invalid-character" && validation.character !== undefined) {
    const character = formatVaultInvalidCharacter(validation.character);
    return t(result.field === "file" ? "invalidFilenameCharacter" : "invalidFolderCharacter", {
      character,
    });
  }
  return t(result.field === "file" ? "invalidFilename" : "invalidFolderPath", {
    name: validation.segment,
  });
}
