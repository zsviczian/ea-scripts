/** @file main.ts @overview Launches the persistent Scientific Plotter sidepanel. */
import { runPlotter } from "./run";
void runPlotter(ea, utils).catch((error: unknown) => {
  console.error(error);
});
