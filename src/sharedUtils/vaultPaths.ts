/**
 * @file vaultPaths.ts
 * @overview Shared helpers for validating vault-relative file/folder names and ranking folder suggestions.
 */

export type VaultNameValidationReason =
  | "empty"
  | "invalid-character"
  | "dot-segment"
  | "reserved-name"
  | "trailing-dot-or-space"
  | "invalid-path-shape";

export type VaultNameValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason: VaultNameValidationReason;
      segment: string;
      character?: string;
    };

const INVALID_FILE_NAME_CHARACTER = /[\\/:*?"<>|\u0000-\u001F]/u;
const INVALID_FOLDER_SEGMENT_CHARACTER = /[\\:*?"<>|\u0000-\u001F]/u;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/** Returns the first invalid character in a vault file/folder name, if present. */
function firstInvalidCharacter(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[0] ?? null;
}

/** Validates one path segment using portable Obsidian-vault naming rules. */
function validateSegment(
  segment: string,
  invalidCharacterPattern: RegExp,
  allowEmpty: boolean,
): VaultNameValidationResult {
  if (!segment) {
    return allowEmpty ? { valid: true } : { valid: false, reason: "empty", segment };
  }
  if (segment === "." || segment === "..") {
    return { valid: false, reason: "dot-segment", segment };
  }
  const invalidCharacter = firstInvalidCharacter(segment, invalidCharacterPattern);
  if (invalidCharacter !== null) {
    return {
      valid: false,
      reason: "invalid-character",
      segment,
      character: invalidCharacter,
    };
  }
  if (WINDOWS_RESERVED_NAME.test(segment)) {
    return { valid: false, reason: "reserved-name", segment };
  }
  if (/[. ]$/u.test(segment)) {
    return { valid: false, reason: "trailing-dot-or-space", segment };
  }
  return { valid: true };
}

/** Validates a single vault filename. Path separators are rejected. */
export function validateVaultFileName(fileName: string): VaultNameValidationResult {
  return validateSegment(fileName, INVALID_FILE_NAME_CHARACTER, false);
}

/**
 * Validates a vault-relative folder path. Forward slashes are path separators;
 * invalid characters are rejected inside every folder segment. The empty string
 * is accepted as the vault root.
 */
export function validateVaultFolderPath(folderPath: string): VaultNameValidationResult {
  if (folderPath === "" || folderPath === "/") return { valid: true };
  if (folderPath.startsWith("/") || folderPath.endsWith("/") || folderPath.includes("//")) {
    return { valid: false, reason: "invalid-path-shape", segment: folderPath };
  }
  for (const segment of folderPath.split("/")) {
    const result = validateSegment(segment, INVALID_FOLDER_SEGMENT_CHARACTER, false);
    if (!result.valid) return result;
  }
  return { valid: true };
}

/** Presents control characters in a readable form for validation messages. */
export function formatVaultInvalidCharacter(character: string): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint >= 0x20) return character;
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Filters folder paths by a case-insensitive substring and ranks prefix matches
 * before other matches, then sorts alphabetically.
 */
export function rankVaultFolderSuggestions(
  folderPaths: readonly string[],
  query: string,
): string[] {
  const lowerQuery = query.toLowerCase();
  return [...new Set(folderPaths)]
    .filter((path) => path.toLowerCase().includes(lowerQuery))
    .sort((left, right) => {
      const leftStarts = left.toLowerCase().startsWith(lowerQuery);
      const rightStarts = right.toLowerCase().startsWith(lowerQuery);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return left.localeCompare(right);
    });
}
