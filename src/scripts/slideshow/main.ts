/**
 * @file main.ts
 * @overview Import-safe slideshow runner bootstrap.
 *
 * Build output: build/slideshow/slideshow.md
 */

import { runSlideshow } from "./run";
import { loadSlideshowConfig } from "./slideshowSettings";

void runSlideshow(ea, utils, loadSlideshowConfig(ea));
