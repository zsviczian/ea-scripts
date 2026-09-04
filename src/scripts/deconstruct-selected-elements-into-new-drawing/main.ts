/**
 * @file main.ts
 * @overview
 *   Deconstruct Selected Elements Into New Drawing script entrypoint.
 *
 *   Folder: src/scripts/deconstruct-selected-elements-into-new-drawing
 *   Build output: build/deconstruct-selected-elements-into-new-drawing/deconstruct-selected-elements-into-new-drawing.md
 *
 * @author Zsolt Viczián
 * @version 1.0.0
 * @created 2026-09-04
 */

import { createDeconstructTranslator } from "./lang";
import { runDeconstructSelectedElements } from "./run";

const t = createDeconstructTranslator(ea.obsidian.moment.locale());
void runDeconstructSelectedElements(ea, app, t);
