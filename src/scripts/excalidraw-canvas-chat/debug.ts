/**
 * @file debug.ts
 * @overview Developer-console diagnostics for Excalidraw Canvas Chat.
 */

const PREFIX = "[Excalidraw Canvas Chat]";

function debugValueToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack }, null, 2);
  }
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Error) {
        return { name: item.name, message: item.message, stack: item.stack };
      }
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    }, 2);
  } catch {
    return String(value);
  }
}

function debugLine(label: string, values: unknown[]): string {
  if (values.length === 0) return `${PREFIX} ${label}`;
  return `${PREFIX} ${label}\n${values.map(debugValueToString).join("\n")}`;
}

/** Writes diagnostics as one copy-friendly console string when debug logging is enabled. */
export function debugLog(enabled: boolean, label: string, value?: unknown): void {
  if (!enabled) return;
  console.log(debugLine(label, typeof value === "undefined" ? [] : [value]));
}

/** Writes an error diagnostic as one copy-friendly console string when debug logging is enabled. */
export function debugError(enabled: boolean, label: string, error: unknown, value?: unknown): void {
  if (!enabled) return;
  const values = typeof value === "undefined" ? [error] : [error, value];
  console.error(debugLine(label, values));
}
