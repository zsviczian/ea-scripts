/** Standalone script lane using the plugin's owned-vault preparation, lock and cleanup. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const authoringRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const pluginRoot = resolve(authoringRoot, "../obsidian-excalidraw-plugin");
const load = (path) => import(pathToFileURL(join(pluginRoot, "scripts/testing", path)));
const { acquireHostLock } = await load("host/hostLock.mjs");
const { spawnNativeSync, obsidianCliExecutable } = await load("host/processTools.mjs");
const { produceCombination, stageExtras } = await load("host/combination.mjs");
const { configureLocalVaultEnvironment, prepareLocalVault, restoreLocalVaultBaseline } =
  await load("localVault.mjs");
const { createAcknowledgedCLI } = await load("host/acknowledgedCLI.mjs");
const { runObsidianSmoke } = await load("host/runner.mjs");
const { runInAppTask } = await load("host/inAppTask.mjs");
const { sourceIdentity, validateArtifactManifest } = await load("contracts.mjs");
const userDataPath =
  process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/obsidian")
    : process.platform === "win32"
      ? join(process.env.APPDATA, "obsidian")
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "obsidian");
const target = configureLocalVaultEnvironment(pluginRoot);
const lock = acquireHostLock({ userDataPath });
const reportDir = join(pluginRoot, ".test-work/reports/printable-layout-" + randomUUID());
const invoke = (command, args, timeout = 60000) => {
  const result = spawnNativeSync(
    obsidianCliExecutable(),
    ["vault=" + target.vaultName, command, ...args],
    {
      cwd: pluginRoot,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error || result.status)
    throw Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
};
const receipts = createAcknowledgedCLI((command, ...args) => invoke(command, args), { invoke });
let ready = false;
try {
  const provided = process.argv.find((arg) => arg.startsWith("--combination="))?.slice(14);
  const combination = provided
    ? { ...JSON.parse(readFileSync(join(provided, "combination.json"), "utf8")), output: provided }
    : produceCombination({
        pluginRoot,
        forkRoot: resolve(pluginRoot, "../excalidraw"),
        extrasRoot: resolve(pluginRoot, "../obsidian-excalidraw-extras"),
        output: join(pluginRoot, ".test-work/frozen/printable-layout-" + randomUUID()),
      });
  for (const [kind, manifest] of Object.entries(combination.manifests)) {
    validateArtifactManifest(manifest, join(combination.output, kind));
    const { commit, dirty, diffHash, lockfileHash } = manifest;
    assert.deepEqual(
      sourceIdentity(combination.roots[kind]),
      { commit, dirty, diffHash, lockfileHash },
      "Source changed since fresh combination preparation",
    );
  }
  const preparation = await prepareLocalVault({
    projectRoot: pluginRoot,
    combination,
    userDataPath,
    cli: receipts.cli,
  });
  assert.ok(preparation.ready, "Open and trust the repository-owned test vault in Obsidian");
  ready = true;
  const script = readFileSync(
    join(authoringRoot, "build/printable-layout-wizard/printable-layout-wizard.md"),
    "utf8",
  );
  const report = await runObsidianSmoke({
    projectRoot: pluginRoot,
    ...target,
    expectedUserDataPath: userDataPath,
    reportDir,
    ownedDebugger: true,
    source: { scriptHash: createHash("sha256").update(script).digest("hex") },
    runCli: (_vault, command, ...args) => receipts.cli(command, ...args),
    runBuild: () => ({ pluginArtifactRoot: join(combination.output, "plugin"), combination }),
    deployCompanions: (context) => stageExtras({ combination, ...context }),
    scenarios: [
      async ({ cli, drawingPath }) => ({
        id: "printable-layout-wizard",
        status: "passed",
        ...(await runInAppTask({
          cli,
          execute: exercise,
          args: [drawingPath, script],
          timeoutMs: 120000,
        })),
      }),
    ],
  });
  await restoreLocalVaultBaseline({ projectRoot: pluginRoot, cli: receipts.cli });
  ready = false;
  writeFileSync(
    join(authoringRoot, "src/scripts/printable-layout-wizard/native-evidence.json"),
    JSON.stringify(
      {
        status: report.status,
        platform: process.platform,
        boundary:
          "Actual Script Engine, UI and SVG generation; EA.createPDF submission captured. Native PDF printing and physical mobile touch were not exercised.",
        scriptHash: report.source.scriptHash,
        artifacts: {
          sourceHashes: report.artifacts.sourceHashes,
          installedHashes: report.artifacts.installedHashes,
          version: report.artifacts.version,
        },
        scenarios: report.scenarios.map(({ id, status, assertions, tests, reason }) => ({
          id,
          status,
          assertions,
          tests,
          reason,
        })),
        cleanup: report.cleanup,
        baselineRestored: true,
        reportDir,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(JSON.stringify({ status: report.status, reportDir }) + "\n");
  assert.equal(report.status, "passed", report.error);
} finally {
  try {
    if (ready) await restoreLocalVaultBaseline({ projectRoot: pluginRoot, cli: receipts.cli });
  } finally {
    receipts.dispose();
    lock.release();
  }
}

/** Exercise the actual bundled script and host renderer; PDF submission is captured, never printed. */
async function exercise(c, drawingPath, script) {
  const plugin = app.plugins.plugins["obsidian-excalidraw-plugin"];
  const main = app.workspace
    .getLeavesOfType("excalidraw")
    .find((leaf) => leaf.view.file?.path === drawingPath);
  const eas = [];
  let pop;
  c.observations = {};
  c.defer(async () => {
    app.__printableLayoutWizard?.modal.close();
    eas.forEach((ea) => ea.destroy());
    if (pop) {
      await pop.setViewState({ type: "empty", state: {} });
      pop.detach();
    }
  });
  const check = (value, message) => {
    if (!value) throw Error(message);
  };
  await c.case("wizard-frame-controls", [], async () => {
    const view = main.view,
      api = view.excalidrawAPI;
    await plugin.scriptEngine.executeScript(view, script, "Printable Layout Wizard");
    const modal = app.__printableLayoutWizard.modal;
    const button = (label) =>
      [...modal.contentEl.querySelectorAll("button")].find(
        (el) => el.getAttribute("aria-label") === label,
      );
    check(button("Create first frame"), "empty drawing did not offer first page");
    button("Create first frame").click();
    await c.waitFor(
      () =>
        api.getSceneElements().filter((el) => el.type === "frame").length === 1 &&
        button("Rotate next page"),
      "first page created",
    );
    const first = api.getSceneElements().find((el) => el.type === "frame");
    check(
      first.frameRole === "marker" && first.locked && first.name === "01",
      "first-page marker, lock or name lost",
    );
    button("Rotate next page").click();
    button("Add page to the right").click();
    await c.waitFor(
      () =>
        api.getSceneElements().filter((el) => el.type === "frame").length === 2 &&
        button("Rotate next page")?.getAttribute("aria-pressed") === "false",
      "rotated adjacent frame",
    );
    const second = api.getSceneElements().find((el) => el.type === "frame" && el.id !== first.id);
    check(
      second.x === first.x + first.width &&
        second.width === first.height &&
        second.height === first.width &&
        second.name === "02",
      "rotation/adjacency/naming differs",
    );
    await view.save(false, true);
    const saved = await plugin.ea.getSceneFromFile(view.file);
    check(
      saved.elements.some((el) => el.id === second.id && el.locked && el.frameRole === "marker"),
      "page frame did not persist",
    );
    modal.close();
    api.updateScene({ elements: [], captureUpdate: "NEVER" });
    await view.save(false, true);
    return {
      assertions: [
        "empty-drawing first-frame UI",
        "locked marker frame defaults",
        "rotate-next-page resets after use",
        "adjacent frame position and sequential naming",
        "actual frame save/reload",
      ],
    };
  });
  for (const mode of ["main", "popout"]) {
    let leaf = main;
    if (mode === "popout") {
      pop = app.workspace.openPopoutLeaf();
      leaf = pop;
      await c.waitFor(
        () => leaf.view.containerEl.ownerDocument !== main.view.ownerDocument,
        "empty popout window migration",
      );
      await leaf.setViewState({ type: "excalidraw", state: { file: drawingPath } });
      await c.waitFor(
        () =>
          leaf.view.excalidrawAPI &&
          leaf.view.isLoaded &&
          !leaf.view.semaphores.justLoaded &&
          !leaf.view.isClosingOrMigrating() &&
          leaf.view.ownerDocument !== main.view.ownerDocument,
        "popout ready after window migration",
      );
    }
    app.workspace.setActiveLeaf(leaf, { focus: true });
    const view = leaf.view,
      api = view.excalidrawAPI;
    const editor = plugin.ea.getAPI(view);
    eas.push(editor);
    await c.case("wizard-" + mode, [], async () => {
      editor.clear();
      for (let i = 0; i < 10; i++) {
        const id = editor.addFrame(i * 400, -100, 300, 400, String(i + 1).padStart(2, "0"));
        editor.getElement(id).frameRole = "marker";
        editor.getElement(id).locked = true;
        if (i !== 1) editor.addText(i * 400 + 25, 25, "Page " + (i + 1));
      }
      await editor.addElementsToView(false, true, true);
      editor.clear();
      editor.activeScript = "Printable Layout Wizard";
      await editor.setScriptSettings({
        ...editor.getScriptSettings(),
        "Print empty pages": { value: false },
      });
      const sceneBefore = JSON.stringify(api.getSceneElements());
      const rendering = JSON.stringify(api.getAppState().frameRendering);
      const previousEAs = new Set();
      plugin.scriptEngine.eaInstances.forEach((item) => previousEAs.add(item));
      await plugin.scriptEngine.executeScript(view, script, "Printable Layout Wizard");
      c.observations[mode] = {
        sameView: leaf.view === view,
        loaded: view._loaded,
        closing: view.isClosingOrMigrating(),
        eaTarget: editor.targetView === view,
        hasModal: !!app.__printableLayoutWizard,
        notices: [...document.querySelectorAll(".notice")].map((el) => el.textContent),
      };
      await c.waitFor(() => app.__printableLayoutWizard?.modal, "wizard opens");
      const modal = app.__printableLayoutWizard.modal;
      check(
        modal.contentEl.ownerDocument === view.ownerDocument,
        "wizard opened in the wrong document",
      );
      let ea;
      plugin.scriptEngine.eaInstances.forEach((item) => {
        if (!previousEAs.has(item) && item.activeScript === "Printable Layout Wizard") ea = item;
      });
      check(ea, "script-owned EA missing");
      eas.push(ea);
      const outputs = [];
      ea.createPDF = async (result) => {
        outputs.push(result);
      };
      const button = (label) =>
        [...modal.contentEl.querySelectorAll("button")].find(
          (el) => el.getAttribute("aria-label") === label,
        );
      button("Printing").click();
      const input = () => modal.contentEl.querySelector('input[aria-label="Pages"]');
      const set = (value) => {
        const el = input();
        el.value = value;
        el.dispatchEvent(new el.ownerDocument.defaultView.Event("input", { bubbles: true }));
      };
      check(input(), "page range input missing");
      set("1, 3-5, 9-");
      let previous = input();
      button("Export to PDF").click();
      await c.waitFor(() => outputs.length === 1 && input() !== previous, "selected PDF submitted");
      const pages = outputs[0].SVG;
      check(pages.length === 6, "range selected wrong page count");
      check(
        pages.map((page) => Number(page.getAttribute("viewBox").split(" ")[0])).join(",") ===
          "0,800,1200,1600,3200,3600",
        "range ordering/crop coordinates differ",
      );
      check(
        pages.every(
          (page) => page.getAttribute("width") === "300" && page.getAttribute("height") === "400",
        ),
        "custom SVG page size lost",
      );
      check(
        outputs[0].pageProps.dimensions.width === 0 && outputs[0].pageProps.dimensions.height === 0,
        "per-SVG PDF sizing lost",
      );
      check(JSON.stringify(api.getSceneElements()) === sceneBefore, "printing mutated drawing");
      set("5-3");
      button("Export to PDF").click();
      check(
        modal.contentEl.querySelector('[role="alert"]').textContent.length > 0 &&
          outputs.length === 1,
        "invalid range reached export",
      );
      set("2");
      // Defaults skip empty pages; selecting the empty frame must not reach PDF submission.
      previous = input();
      button("Export to PDF").click();
      await c.waitFor(() => input() !== previous, "empty selection returns");
      check(outputs.length === 1, "empty frame was printed by default");
      const currentToggle = [...modal.contentEl.querySelectorAll(".setting-item")]
        .find((el) => el.querySelector(".setting-item-name")?.textContent === "Print empty pages")
        .querySelector(".checkbox-container");
      currentToggle.click();
      set("2");
      previous = input();
      button("Export to PDF").click();
      await c.waitFor(
        () => outputs.length === 2 && input() !== previous,
        "explicit empty page exported",
      );
      check(outputs[1].SVG.length === 1, "empty-page toggle did not retain selected page");
      await plugin.scriptEngine.executeScript(view, script, "Printable Layout Wizard");
      check(app.__printableLayoutWizard.modal === modal, "repeated invocation duplicated modal");
      modal.close();
      check(!app.__printableLayoutWizard, "modal runtime retained after close");
      check(
        JSON.stringify(api.getAppState().frameRendering) === rendering,
        "frame rendering was not restored",
      );
      // The two cases reuse the disposable drawing; clear it before the next view opens.
      api.updateScene({ elements: [], captureUpdate: "NEVER" });
      await view.save(false, true);
      return {
        assertions: [
          "actual Script Engine bootstrap",
          "main/popout range UI",
          "six ordered custom-size SVG pages",
          "invalid range rejected",
          "empty-page handling",
          "source scene unchanged",
          "repeat activation reused dialog",
          "close restored rendering and removed runtime",
        ],
      };
    });
  }
  return {
    tests: c.tests,
    limitation:
      "PDF submission captured at EA.createPDF; native PDF printing and physical mobile touch are separate manual gates.",
  };
}
