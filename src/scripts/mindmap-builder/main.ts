/**
 * @file main.ts
 * @overview Mindmap Builder bootstrap. Build output: build/mindmap-builder/mindmap-builder.md.
 */
import { reportMindmapLaunchError, runMindmapBuilder } from "./run";

const VERSION = "v26.10.13";

void runMindmapBuilder(ea, utils, VERSION).catch((error: unknown) => {
  reportMindmapLaunchError(ea, error);
});
