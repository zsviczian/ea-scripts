/**
 * @file main.ts
 * @overview Mindmap Builder bootstrap. Build output: build/mindmap-builder/mindmap-builder.md.
 */
import { reportMindmapLaunchError, runMindmapBuilder } from "./run";

const VERSION = "v26.11.01";

void runMindmapBuilder(ea, utils, VERSION).catch((error: unknown) => {
  reportMindmapLaunchError(ea, error);
});
