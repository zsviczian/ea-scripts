/** Compare the preserved slideshow export/fingerprint/cache contract against a Git checkpoint. */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const baseline = process.argv[2] ?? "498cf85";
const modules = [];
for (const source of [
  execFileSync("git", ["show", baseline + ":src/scripts/slideshow/SlidePreviewService.ts"], {
    cwd: root,
    encoding: "utf8",
  }),
  readFileSync(root + "/src/scripts/slideshow/SlidePreviewService.ts", "utf8"),
]) {
  const compiled = await build({
    stdin: { contents: source, loader: "ts", resolveDir: root + "/src/scripts/slideshow" },
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "previewModule",
    write: false,
  });
  modules.push(new Function(compiled.outputFiles[0].text + "; return previewModule;")());
}
let cases = 0;
for (const kind of ["frame", "path"])
  for (const theme of ["light", "dark"])
    for (const width of [120, 480, 960])
      for (const completed of [undefined, 0, 1, 2]) {
        const outputs = [];
        for (const module of modules) {
          const local = [
            {
              id: "f",
              type: "frame",
              name: "A",
              x: 0,
              y: 0,
              width: 600,
              height: 400,
              opacity: 100,
            },
            {
              id: "a",
              type: "rectangle",
              frameId: "f",
              x: 10,
              y: 10,
              width: 50,
              height: 50,
              opacity: 60,
              groupIds: [],
            },
            {
              id: "b",
              type: "rectangle",
              frameId: "f",
              x: 100,
              y: 100,
              width: 50,
              height: 50,
              opacity: 100,
              groupIds: [],
            },
            { id: "path", type: "line", x: 0, y: 0, width: 600, height: 400, opacity: 100 },
          ];
          const calls = [];
          const ea = {
            getViewElements: () => local,
            getElementsIntersectionArea: (e) => e,
            createViewPNG: async (options) => {
              calls.push(structuredClone(options));
              return new Blob(["png"]);
            },
          };
          const api = { getAppState: () => ({ theme, viewBackgroundColor: "#abcdef" }) };
          const slide = {
            id: "f",
            kind,
            frameId: "f",
            pathId: "path",
            rect: { x1: 0, y1: 0, x2: 600, y2: 400 },
            animationSteps: [
              { id: "s1", effect: "fade", targets: [{ type: "element", id: "a" }] },
              { id: "s2", effect: "fade-out", targets: [{ type: "element", id: "b" }] },
            ],
          };
          const service = new module.SlidePreviewService(ea, api, {
            maxZoom: 30,
            printSlideWidth: 600,
            printSlideHeight: 400,
          });
          const state = {
            targetWidth: width,
            completedAnimationSteps: completed,
            originalOpacities: new Map([["a", 80]]),
          };
          const doc = { createElement: () => ({ style: {}, setAttribute() {} }) };
          await service.createPreview(slide, doc, state);
          await service.createPreview(slide, doc, state);
          outputs.push({
            calls,
            source: local,
            fingerprint: module.getSceneVisualFingerprint(local),
          });
          service.clear();
        }
        assert.deepEqual(outputs[0], outputs[1]);
        cases++;
      }
console.log("Old/new slideshow preview contract matrix passed:", cases, "cases");
