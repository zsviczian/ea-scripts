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
const reportDir = join(pluginRoot, ".test-work/reports/slideshow-animation-" + randomUUID());
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
        output: join(pluginRoot, ".test-work/frozen/slideshow-animation-" + randomUUID()),
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
    join(authoringRoot, "build/slideshow/slideshow.md"),
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
        id: "slideshow",
        status: "passed",
        ...(await runInAppTask({
          cli,
          execute: exercise,
          args: [drawingPath, script],
          onRequest: (request) => {
            if (request.method !== "screenshot") throw Error("Unknown host request");
            const name = request.params.name;
            if (!/^[a-z-]+$/.test(name)) throw Error("Unowned screenshot path");
            cli("dev:screenshot", "path=" + join(reportDir, name + ".png"));
          },
          timeoutMs: 120000,
        })),
      }),
    ],
  });
  await restoreLocalVaultBaseline({ projectRoot: pluginRoot, cli: receipts.cli });
  ready = false;
  writeFileSync(
    join(authoringRoot, "src/scripts/slideshow/native-evidence.json"),
    JSON.stringify(
      {
        status: report.status,
        platform: process.platform,
        boundary:
          "Actual Script Engine, selection-driven animation UI, persisted metadata, target PNGs and motion overlay/canvas handoff in main and popout windows. Physical mobile touch was not exercised.",
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

/** Exercises the shipped script against real editor selection, rendering and metadata persistence. */
async function exercise(c, drawingPath, script) {
  const plugin = app.plugins.plugins["obsidian-excalidraw-plugin"];
  const main = app.workspace.getLeavesOfType("excalidraw").find((leaf) => leaf.view.file?.path === drawingPath);
  const runtimeKey = "__excalidrawAutomateSlideshowRuntimeV1";
  const originalRuntime = app[runtimeKey];
  c.observations = {};
  const originalAutostart = { ...plugin.settings.autostartScripts };
  // This lane tests manual editing; avoid leaving registerAutostart() waiting
  // for an unrelated first-run choice after main.ts returns its void promise.
  plugin.settings.autostartScripts.Slideshow = "deny";
  const eas = [];
  let pop;
  c.defer(async () => {
    const runtime = app[runtimeKey];
    for (const leaf of [main, pop].filter(Boolean)) {
      const context = runtime?.contexts.get(leaf.view);
      context?.ea.checkForActiveSidepanelTabForScript()?.close();
      context?.ea.destroy();
    }
    eas.forEach((ea) => ea.destroy());
    if (originalRuntime) app[runtimeKey] = originalRuntime;
    else delete app[runtimeKey];
    plugin.settings.autostartScripts = originalAutostart;
    await plugin.saveSettings();
    if (pop) { await pop.setViewState({ type: "empty", state: {} }); pop.detach(); }
  });
  const check = (value, message) => { if (!value) throw Error(message); };
  for (const mode of ["main", "popout"]) {
    let leaf = main;
    if (mode === "popout") {
      const file = main.view.file;
      await main.view.forceSave(true);
      await main.setViewState({ type: "empty", state: {} });
      pop = app.workspace.openPopoutLeaf();
      await pop.openFile(file);
      leaf = pop;
      await c.waitFor(() => pop.view.excalidrawAPI && pop.view.ownerDocument !== app.workspace.containerEl.ownerDocument, "popout drawing ready");
    }
    app.workspace.setActiveLeaf(leaf, { focus: true });
    const view = leaf.view;
    const api = view.excalidrawAPI;
    const ea = plugin.ea.getAPI(view);
    eas.push(ea);
    let frameId, one, two, text, groupId;
    const selectFirst = () => {
      api.updateScene({ appState: { selectedElementIds: { [one]: true, [text]: true }, selectedGroupIds: { [groupId]: true } }, captureUpdate: "NEVER", forceFlushSync: true });
    };
    await c.case("animation-editor-" + mode, [], async () => {
      api.updateScene({ elements: [], captureUpdate: "NEVER" });
      ea.clear();
      frameId = ea.addFrame(0, 0, 700, 400, "Animation editing");
      ea.getElement(frameId).frameRole = "marker";
      ea.style.backgroundColor = "#8cd4ef";
      ea.style.fillStyle = "solid";
      ea.style.roughness = 0;
      one = ea.addRect(60, 80, 180, 140);
      text = ea.addText(90, 120, "First group");
      ea.addToGroup([one, text]);
      groupId = ea.getElement(one).groupIds[0];
      two = ea.addEllipse(400, 80, 180, 140);
      await ea.addElementsToView(false, true, true);
      ea.clear();
      ea.selectElementsInView([frameId]);
      const modifiers = view.modifierKeyDown;
      try {
        view.modifierKeyDown = { shiftKey: false, ctrlKey: true, metaKey: false, altKey: false };
        await plugin.scriptEngine.executeScript(view, script, "Slideshow");
      } finally { view.modifierKeyDown = modifiers; }
      const context = () => app[runtimeKey]?.contexts.get(view);
      const doc = view.ownerDocument;
      const panel = () => context()?.ea.checkForActiveSidepanelTabForScript()?.contentEl.querySelector(".slideshow-sidepanel");
      const button = (label, root = panel()) => [...(root?.querySelectorAll("button") ?? [])].find((el) =>
        el.getAttribute("aria-label") === label || el.textContent.trim() === label);
      try { await c.waitFor(() => button("Edit animations"), "built script sidepanel ready"); }
      catch (error) {
        c.observations.launch = { registered: !!context(), runtimeSidepanel: !!app[runtimeKey]?.sidepanel, text: doc.body.innerText.slice(-6000) };
        throw error;
      }
      button("Edit animations").click();
      const editor = () => panel()?.querySelector(".slideshow-animation-editor");
      await c.waitFor(() => editor(), "animation editor mounted");
      const expectIcon = (label, name) => {
        const control = button(label, editor());
        const icon = control?.querySelector(`.slideshow-animation-editor__choice-icon[aria-hidden="true"] svg.lucide-${name}`);
        check(icon, `Missing ${label} icon: ${name}`);
        const rect = icon.getBoundingClientRect();
        check(rect.width === 24 && rect.height === 24, `${label} icon size changed`);
      };
      for (const [label, name] of [
        ["Appear", "eye"], ["Fade", "circle-fading-plus"], ["Slide in", "arrow-right-to-line"],
        ["Zoom in", "zoom-in"], ["Disappear", "eye-off"], ["Fade out", "circle-fading-minus"],
        ["Slide out", "arrow-right-from-line"], ["Zoom out", "zoom-out"],
        ["On advance", "step-forward"], ["After delay", "timer"],
      ]) expectIcon(label, name);
      button("After delay", editor()).click();
      check(button("After delay", editor()).getAttribute("aria-pressed") === "true", "delay trigger did not activate");
      check([...editor().querySelectorAll("label")].some((el) => el.textContent.includes("Delay (ms)")), "delay input missing");
      button("On advance", editor()).click();
      const targetCards = () => [...editor().querySelectorAll(".slideshow-animation-editor__target")];
      const expectTargetPreviews = async (count) => {
        await c.waitFor(() => targetCards().length === count && targetCards().every((card) =>
          card.querySelector(".slideshow-animation-editor__target-preview img")?.complete), "selected-target thumbnails ready");
        for (const card of targetCards()) {
          const preview = card.querySelector(".slideshow-animation-editor__target-preview");
          const image = preview.querySelector("img");
          check(card.textContent.trim() === "", "target code is still visible");
          check(preview.getAttribute("role") === "img" && preview.getAttribute("aria-label"), "thumbnail lacks an accessible target description");
          check(image.naturalWidth > 0 && image.naturalWidth <= 161 && image.naturalHeight <= 161, "target thumbnail is empty or unbounded");
          const rect = preview.getBoundingClientRect();
          check(rect.width === 64 && rect.height === 56, "target thumbnail display size changed");
          check(card.querySelector('button[aria-label="Remove target"]'), "target remove control missing");
        }
      };
      api.updateScene({ appState: { selectedElementIds: { [text]: true }, selectedGroupIds: {} }, captureUpdate: "NEVER", forceFlushSync: true });
      await expectTargetPreviews(1);
      editor().querySelector(".slideshow-animation-editor__targets").scrollIntoView({ block: "start" });
      await c.requestHost("screenshot", { name: "animation-target-text-" + mode });
      api.updateScene({ appState: { selectedElementIds: { [one]: true, [two]: true }, selectedGroupIds: {} }, captureUpdate: "NEVER", forceFlushSync: true });
      await expectTargetPreviews(2);
      targetCards()[0].querySelector('button[aria-label="Remove target"]').click();
      await expectTargetPreviews(1);
      check(targetCards()[0].querySelector('[role="img"]').getAttribute("aria-label").includes(two.slice(0, 8)), "removing a target replaced the surviving target");
      selectFirst();
      await c.waitFor(() => button("Add step", editor()) && !button("Add step", editor()).disabled, "first target captured");
      await expectTargetPreviews(1);
      editor().querySelector(".slideshow-animation-editor__targets").scrollIntoView({ block: "start" });
      await c.requestHost("screenshot", { name: "animation-target-group-" + mode });
      button("Slide in", editor()).click();
      for (const [label, name] of [["From bottom", "up"], ["From right", "left"], ["From left", "right"], ["From top", "down"]]) {
        expectIcon(label, `arrow-big-${name}-dash`);
      }
      button("Slide out", editor()).click();
      for (const [label, name] of [["To top", "up"], ["To left", "left"], ["To right", "right"], ["To bottom", "down"]]) {
        expectIcon(label, `arrow-big-${name}-dash`);
      }
      button("Slide in", editor()).click();
      button("From right", editor()).click();
      const savedSteps = () => api.getSceneElements().find((el) => el.id === frameId)?.customData?.slideshow?.animation?.steps ?? [];
      button("Add step", editor()).click();
      try { await c.waitFor(() => savedSteps().length === 1 && button("Add step", editor()) && !button("Add step", editor()).disabled, "add readies next animation"); }
      catch (error) { c.observations.save = { mode, steps: savedSteps(), text: panel()?.innerText, selected: api.getAppState().selectedElementIds }; throw error; }
      await expectTargetPreviews(1);
      await c.waitFor(() => editor().querySelector(".slideshow-animation-editor__step-preview img"), "sequence thumbnail ready");
      check(targetCards()[0].querySelector("img").src === editor().querySelector(".slideshow-animation-editor__step-preview img").src, "target and sequence thumbnails did not share their cached export");
      api.updateScene({ appState: { selectedElementIds: { [two]: true }, selectedGroupIds: {} }, captureUpdate: "NEVER", forceFlushSync: true });
      await c.waitFor(() => button("Add step", editor()) && !button("Add step", editor()).disabled, "next selected target ready");
      check(button("Slide in", editor()).getAttribute("aria-pressed") === "true", "effect was reset");
      check(button("From right", editor()).getAttribute("aria-pressed") === "true", "direction was reset");
      button("Add step", editor()).click();
      await c.waitFor(() => savedSteps().length === 2 && !button("Add step", editor())?.disabled, "second target saved");
      selectFirst();
      await c.waitFor(() => button("Update step", editor()) && !button("Update step", editor()).disabled, "canvas selection loads first animation");
      button("New step", editor()).click();
      button("Fade out", editor()).click();
      button("Add step", editor()).click();
      await c.waitFor(() => savedSteps().length === 3, "same target animated again");
      check(savedSteps()[0].targets[0].type === "group", "group selection was not stored dynamically");
      check(savedSteps()[0].effect === "slide" && savedSteps()[2].effect === "fade-out", "repeated target overwrote prior step");
      await c.waitFor(() => editor().querySelectorAll(".slideshow-animation-editor__step-preview img").length === 3, "target thumbnails generated");
      await Promise.all([...editor().querySelectorAll("img")].map((image) => image.decode()));
      check([...editor().querySelectorAll("img")].every((image) => image.naturalWidth <= 161 && image.naturalHeight <= 161), "target PNG exceeds bound");
      const row = editor().querySelector(".slideshow-animation-editor__step-summary");
      row.click();
      await c.waitFor(() => button("Update step", editor()), "sequence selection loads step");
      // Restore a deterministic slide-in preview; sample the real static canvas
      // when the overlay is removed to detect a blank handoff frame.
      button("Slide in", editor()).click();
      const originalRemove = view.ownerWindow.Element.prototype.remove;
      let handoffs = 0;
      view.ownerWindow.Element.prototype.remove = function () {
        if (this.classList?.contains("slideshow-animation-overlay")) {
          const state = api.getAppState();
          const target = api.getSceneElements().find((el) => el.id === one);
          check(target.opacity > 0, "overlay removed while target hidden");
          const canvas = view.contentEl.querySelector("canvas.excalidraw__canvas.static");
          check(canvas, "static canvas missing");
          const rect = canvas.getBoundingClientRect();
          const px = ((target.x + target.width / 2 + state.scrollX) * state.zoom.value + state.offsetLeft - rect.left) * canvas.width / rect.width;
          const py = ((target.y + target.height / 2 + state.scrollY) * state.zoom.value + state.offsetTop - rect.top) * canvas.height / rect.height;
          const pixel = canvas.getContext("2d").getImageData(Math.round(px), Math.round(py), 1, 1).data;
          check(pixel[2] > pixel[0] + 15, "canvas target not painted at overlay removal: " + [...pixel]);
          handoffs += 1;
        }
        return originalRemove.call(this);
      };
      try {
        button("Preview", editor()).click();
        await c.waitFor(() => handoffs === 1, "motion preview hands off to painted canvas");
        await c.waitFor(() => !view.contentEl.querySelector(".slideshow-animation-overlay"), "preview overlay cleaned");
      } finally { view.ownerWindow.Element.prototype.remove = originalRemove; }
      editor().querySelector(".slideshow-animation-editor__choices-section").scrollIntoView({ block: "start" });
      await c.requestHost("screenshot", { name: "animation-editor-" + mode });
      context().ea.checkForActiveSidepanelTabForScript()?.close();
      await c.waitFor(() => !panel(), "animation panel closed");
      check(!view.contentEl.querySelector(".slideshow-animation-overlay"), "overlay leaked on close");
      context().ea.destroy();
      return { assertions: ["selected text/elements/groups display 64x56 thumbnails instead of target codes", "target removal preserves other selected targets", "target and sequence thumbnails share cached exports", "all effect/direction/trigger icons render at 24px", "trigger buttons update timing controls", "next-step form and sticky effect/direction", "canvas selects first step", "repeated target preserved", "bounded group thumbnails", "motion handoff has painted canvas target", "panel/overlay cleanup"] };
    });
  }
  return { assertions: ["main/popout animation workflows"], tests: c.tests };
}
