/**
 * @file main.ts
 * @overview Import-safe slideshow runner bootstrap.
 *
 * Build output: build/slideshow/slideshow.md
 */

import { runSlideshow } from "./run";
import type { SlideshowConfig } from "./types";

const CONFIG: SlideshowConfig = {
  transitionStepCount: 100,
  transitionDelay: 1000,
  frameSleep: 1,
  editZoomOut: 0.7,
  fadeLevel: 0.1,
  printSlideWidth: 1920,
  printSlideHeight: 1080,
  maxZoom: 30,
};

void runSlideshow(ea, utils, CONFIG);
