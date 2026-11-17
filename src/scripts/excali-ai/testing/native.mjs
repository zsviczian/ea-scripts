/** Standalone script lane using the plugin's owned-vault preparation, lock and cleanup. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
const { behaviorEnvironment } = await load("host/behaviorEnvironment.mjs");
const { behaviorInputDriver } = await load("host/behaviorMatrix.mjs");
const { completeConsoleErrors } = await load("host/debuggerSession.mjs");
const { settleBrowserDiagnostics } = await load("host/browserDiagnostics.mjs");
const { sourceIdentity, validateArtifactManifest } = await load("contracts.mjs");
const userDataPath =
  process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/obsidian")
    : process.platform === "win32"
      ? join(process.env.APPDATA, "obsidian")
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "obsidian");
const target = configureLocalVaultEnvironment(pluginRoot);
const lock = acquireHostLock({ userDataPath });
const reportDir = join(pluginRoot, ".test-work/reports/excali-ai-" + randomUUID());
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
        output: join(pluginRoot, ".test-work/frozen/excali-ai-" + randomUUID()),
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
  const script = readFileSync(join(authoringRoot, "build/excali-ai/excali-ai.md"), "utf8");
  const template = readFileSync(
    join(pluginRoot, "tests/vault/Drawings/Uncompressed.excalidraw.md"),
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
      async ({ cli, drawingPath }) => {
        const tests = [];
        for (const context of ["main", "popout"]) {
          const execute = new Function(`return async function(c,path,context,template,script){
          const env=await (${behaviorEnvironment.toString()})(c,path,{id:context,input:'mouse'},template,${completeConsoleErrors.toString()},${settleBrowserDiagnostics.toString()});
          const runCase=c.case.bind(c);c.case=async(...args)=>{c.phase=args[0];return runCase(...args);};
          await (${exercise.toString()})(c,env,script);
          return {tests:c.tests,consoleErrors:c.externalConsoleErrors||[],windowErrors:env.windowErrors};
        }`)();
          const result = await runInAppTask({
            cli,
            execute,
            args: [drawingPath, context, template, script],
            onRequest: behaviorInputDriver(cli),
            onProgress: (phase) => {
              if (phase) process.stdout.write(phase + "\n");
            },
            timeoutMs: 300000,
            cleanupMs: 60000,
          });
          assert.equal(result.consoleErrors.length, 0, "script console errors");
          assert.equal(result.windowErrors.length, 0, "script window errors");
          tests.push(...result.tests);
        }
        return { id: "excali-ai-mocked", status: "passed", tests };
      },
    ],
  });
  await restoreLocalVaultBaseline({ projectRoot: pluginRoot, cli: receipts.cli });
  ready = false;
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

/** Exercises the published script with real exports/UI/importers and fake provider results. */
async function exercise(c, env, script) {
  const { p, doc, win, check, openDrawing, geometry } = env,
    context = geometry().requested.id;
  const name = "ExcaliAI native " + context,
    proto = Object.getPrototypeOf(p.ea),
    old = {},
    eas = new Set();
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=";
  let pauseText = false,
    releaseText;
  c.defer(() => releaseText?.());
  let pauseImport = "",
    releaseImport;
  c.defer(() => releaseImport?.());
  let calls = [],
    responseContent = "",
    expectedKind = "";
  const snapshot = {
    enabled: true,
    providerProfiles: {
      test: { provider: "openai", baseURL: "https://example.invalid/v1", hasApiKey: true },
    },
    textModels: {
      text: {
        providerId: "test",
        model: "gpt-6.1-sol",
        multimodalSupport: true,
        reasoningEffort: "low",
      },
    },
    imageModels: {
      image: {
        providerId: "test",
        model: "gpt-image-2.6-flare",
        supportedSizes: ["1024x1024", "1536x1024"],
        supportsPromptImageTransforms: true,
        supportsMaskImageEdits: true,
      },
    },
    defaultTextModel: "text",
    defaultMultimodalTextModel: "text",
    defaultImageModel: "image",
    defaultMaxResponseTokens: 4096,
    defaultMaxOutgoingTokens: 0,
  };
  for (const method of [
    "getAISettings",
    "generateAIText",
    "analyzeAIImage",
    "generateAIImage",
    "transformAIImage",
    "maskEditAIImage",
  ]) {
    old[method] = proto[method];
    proto[method] = function (request) {
      if (this.activeScript !== name) return old[method].call(this, request);
      eas.add(this);
      if (method === "getAISettings") return structuredClone(snapshot);
      calls.push({ method, request });
      if (method === "generateAIText" || method === "analyzeAIImage") {
        const result = {
          response: { status: 200 },
          content: responseContent,
          json: { choices: [{ message: { content: responseContent }, finish_reason: "stop" }] },
        };
        if (pauseText)
          return new Promise((resolve) => {
            releaseText = () => resolve(result);
          });
        return Promise.resolve(result);
      }
      return Promise.resolve({
        response: { status: 200 },
        json: {},
        images: [{ dataURL: image }],
        firstImage: { dataURL: image },
        revisedPrompt: "Native revised prompt",
      });
    };
  }
  for (const method of ["addImage", "addMermaid"]) {
    old[method] = proto[method];
    proto[method] = async function (...args) {
      const result = await old[method].apply(this, args);
      if (this.activeScript === name && pauseImport === method) {
        return new Promise((resolve) => {
          releaseImport = () => resolve(result);
        });
      }
      return result;
    };
  }
  c.defer(() => {
    for (const method of Object.keys(old)) proto[method] = old[method];
    eas.forEach((ea) => ea.destroy());
  });
  c.defer(() => {
    doc
      .querySelectorAll(".excali-ai-floating-modal,.excali-ai-task-editor-modal")
      .forEach((el) => el.closest(".modal-container")?.remove());
  });
  const modal = () => doc.querySelector(".excali-ai-floating-modal");
  const variants = [
    {
      id: "html",
      mode: "text-result",
      type: "html",
      content: "```html\n<html><body>Native HTML result</body></html>\n```",
    },
    {
      id: "svg",
      mode: "text-result",
      type: "svg",
      content:
        '```svg\n<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect x="0" y="0" width="80" height="60" fill="blue"/></svg>\n```',
    },
    {
      id: "mermaid",
      mode: "text-result",
      type: "mermaid",
      content: "```mermaid\ngraph TD; A[Native A]-->B[Native B]\n```",
    },
    {
      id: "prompt-image",
      mode: "image-prompt",
      type: "image",
      content: "```text\nA blue rectangle\n```",
    },
    { id: "direct-image", mode: "image-direct", type: "image-silent" },
    { id: "transform", mode: "image-edit", type: "image", selected: true, mask: false },
    { id: "mask", mode: "image-edit", type: "image", selected: true, mask: true },
  ];
  for (const variant of variants) {
    await c.case("script:excali-ai:" + context + ":" + variant.id, [], async () => {
      const view = await openDrawing("excaliai-" + variant.id),
        api = view.excalidrawAPI;
      api.updateScene({ elements: [], captureUpdate: "NEVER" });
      if (variant.selected) {
        const ea = p.ea.getAPI(view);
        try {
          const id = await ea.addImage(0, 0, image);
          ea.getElement(id).width = 200;
          ea.getElement(id).height = 150;
          await ea.addElementsToView(false, true, true);
          ea.selectElementsInView([ea.getElement(id)]);
          await c.waitFor(
            () => api.getAppState().selectedElementIds[id],
            "source image selection is committed",
          );
        } finally {
          ea.destroy();
        }
      }
      p.settings.scriptEngineSettings[name] = {
        schemaVersion: 1,
        config: {
          tasks: [
            {
              id: "native",
              name: "Native task",
              help: "A deterministic native fixture",
              systemPrompt: "Test system prompt",
              outputInstruction: "Test output instruction",
              execution: {
                mode: variant.mode,
                resultType: variant.type,
                userPrompt: "optional",
                imageInput: variant.selected ? "required" : "disabled",
                maskMode: variant.mask ? "required" : "disabled",
                requiresApi: "",
              },
            },
          ],
        },
        state: {
          selectedTaskId: "native",
          userPrompt: "Create a result",
          maskEdit: variant.mask !== false,
          textModel: "text",
          imageModel: "image",
          maxTokens: "2048",
          imageSize: "1024x1024",
        },
      };
      calls = [];
      responseContent = variant.content || "";
      expectedKind = variant.id;
      await p.scriptEngine.executeScript(view, script, name);
      await c.waitFor(
        () => modal()?.querySelector("button.mod-cta"),
        "ExcaliAI Run control is ready",
      );
      if (variant.mode === "text-result" || variant.mode === "image-prompt")
        check(
          modal().textContent.includes("Reasoning effort: low"),
          "model reasoning effort is not shown",
        );
      const button = modal().querySelector("button.mod-cta");
      check(button, "Run button absent");
      await env.click(button);
      await c.waitFor(() => !modal(), "ExcaliAI closes on run");
      await c.waitFor(
        () => {
          const elements = api.getSceneElements().filter((el) => !el.isDeleted);
          if (variant.type === "html")
            return elements.some((el) => {
              if (el.type !== "embeddable" || !el.link?.startsWith("data:")) return false;
              const comma = el.link.indexOf(","),
                payload = el.link.slice(comma + 1);
              return (
                /;base64,/.test(el.link) ? atob(payload) : decodeURIComponent(payload)
              ).includes("Native HTML result");
            });
          if (variant.type === "svg") return elements.some((el) => el.type !== "embeddable");
          if (variant.type === "mermaid")
            return elements.some((el) => el.type === "text" && el.text === "Native A");
          return elements.filter((el) => el.type === "image").length > (variant.selected ? 1 : 0);
        },
        "generated " + variant.id + " is inserted",
      );
      check(
        calls.length === (variant.mode === "image-prompt" ? 2 : 1),
        "unexpected provider call count for " + expectedKind,
      );
      const textCall = calls.find(
        (call) => call.method === "generateAIText" || call.method === "analyzeAIImage",
      );
      if (textCall) {
        check(
          textCall.request.reasoningEffort === "low" && textCall.request.maxTokens === 2048,
          "text request lost reasoning/token overrides",
        );
        check(!textCall.request.apiKey, "script copied a key");
      }
      if (variant.id === "direct-image")
        check(calls[0].method === "generateAIImage", "direct task used a text step");
      if (variant.id === "transform")
        check(calls[0].method === "transformAIImage", "transform routing changed");
      if (variant.id === "mask")
        check(
          calls[0].method === "maskEditAIImage" &&
            calls[0].request.imageGenerationProperties.mask?.startsWith("data:image/png"),
          "mask routing or mask export failed",
        );
      await view.forceSave(true);
      return {
        assertions: [
          "real bundled Script Engine modal and canvas insertion",
          "expected mocked provider routing",
          "no live API access",
        ],
        calls: calls.map((call) => ({
          method: call.method,
          reasoningEffort: call.request.reasoningEffort,
        })),
      };
    });
  }
  await c.case("script:excali-ai:" + context + ":task-editor", [], async () => {
    const view = await openDrawing("excaliai-task-editor");
    calls = [];
    await p.scriptEngine.executeScript(view, script, name);
    await c.waitFor(() => modal()?.querySelector("button.mod-cta"), "task editor launcher");
    const edit = [...modal().querySelectorAll("button")].find(
      (el) => (el.getAttribute("aria-label") || el.textContent).trim() === "Edit tasks",
    );
    check(edit, "Edit tasks button absent");
    await env.click(edit);
    let editor;
    await c.waitFor(
      () => (editor = doc.querySelector(".excali-ai-task-editor-modal")),
      "task editor opens",
    );
    const input = [...editor.querySelectorAll("input")].find((el) => el.value === "Native task");
    check(input, "task name input absent");
    input.value = "Renamed native task";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    const done = [...editor.querySelectorAll("button")].find(
      (el) => (el.getAttribute("aria-label") || el.textContent).trim() === "Done",
    );
    check(done, "Done button absent");
    await env.click(done);
    await c.waitFor(
      () =>
        !doc.querySelector(".excali-ai-task-editor-modal") &&
        modal()?.querySelector("button.mod-cta"),
      "task editor saves and returns",
    );
    check(
      p.settings.scriptEngineSettings[name].config.tasks[0].name === "Renamed native task",
      "task edit was not persisted",
    );
    await env.click(modal().querySelector(".modal-header-button,.modal-close-button,.modal-close"));
    await c.waitFor(() => !modal(), "task editor return closes");
    check(calls.length === 0, "editing tasks called a provider");
    return {
      assertions: ["task editor persists edits and returns to the main modal without API calls"],
    };
  });
  await c.case("script:excali-ai:" + context + ":cancel", [], async () => {
    const view = await openDrawing("excaliai-cancel"),
      before = JSON.stringify(view.excalidrawAPI.getSceneElements());
    calls = [];
    await p.scriptEngine.executeScript(view, script, name);
    await c.waitFor(() => modal()?.querySelector("button.mod-cta"), "cancel modal is ready");
    check(
      doc.querySelectorAll(".excali-ai-floating-modal").length === 1,
      "multiple ExcaliAI modals before cancellation",
    );
    await env.click(modal().querySelector(".modal-header-button,.modal-close-button,.modal-close"));
    await c.waitFor(() => !modal(), "cancel closes modal");
    check(calls.length === 0, "cancellation called a provider");
    check(
      JSON.stringify(view.excalidrawAPI.getSceneElements()) === before,
      "cancel changed the drawing",
    );
    return { assertions: ["cancelling creates no request and no elements"] };
  });
  await c.case("script:excali-ai:" + context + ":retired-view", [], async () => {
    const view = await openDrawing("excaliai-retired");
    const settings = p.settings.scriptEngineSettings[name];
    settings.config.tasks[0].execution = {
      mode: "text-result",
      resultType: "html",
      userPrompt: "required",
      imageInput: "disabled",
      maskMode: "disabled",
      requiresApi: "",
    };
    calls = [];
    pauseText = true;
    responseContent = "```html\n<html><body>Late result</body></html>\n```";
    await p.scriptEngine.executeScript(view, script, name);
    await c.waitFor(() => modal()?.querySelector("button.mod-cta"), "retired-view Run control");
    await env.click(modal().querySelector("button.mod-cta"));
    await c.waitFor(() => releaseText && calls.length === 1, "provider request is pending");
    const replacement = await openDrawing("excaliai-replacement");
    const before = JSON.stringify(replacement.excalidrawAPI.getSceneElements());
    releaseText();
    pauseText = false;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    check(
      JSON.stringify(replacement.excalidrawAPI.getSceneElements()) === before,
      "late response changed a replacement drawing",
    );
    return {
      assertions: ["a response for a retired file cannot insert into its replacement drawing"],
    };
  });
  for (const variant of ["image-direct", "image-edit", "mermaid"]) {
    await c.case("script:excali-ai:" + context + ":retired-" + variant, [], async () => {
      const view = await openDrawing("excaliai-retired-" + variant);
      if (variant === "image-edit") {
        const ea = p.ea.getAPI(view);
        try {
          const id = await ea.addImage(0, 0, image);
          ea.getElement(id).width = 200;
          ea.getElement(id).height = 150;
          await ea.addElementsToView(false, true, true);
          ea.selectElementsInView([ea.getElement(id)]);
        } finally {
          ea.destroy();
        }
      }
      const settings = p.settings.scriptEngineSettings[name];
      settings.config.tasks[0].execution = {
        mode: variant === "mermaid" ? "text-result" : variant,
        resultType:
          variant === "mermaid" ? "mermaid" : variant === "image-edit" ? "image" : "image-silent",
        userPrompt: "required",
        imageInput: variant === "image-edit" ? "required" : "disabled",
        maskMode: "disabled",
        requiresApi: "",
      };
      settings.state.maskEdit = false;
      calls = [];
      responseContent = "```mermaid\ngraph TD; A[Late import]-->B[Must not insert]\n```";
      pauseImport = variant === "mermaid" ? "addMermaid" : "addImage";
      releaseImport = undefined;
      await p.scriptEngine.executeScript(view, script, name);
      await c.waitFor(() => modal()?.querySelector("button.mod-cta"), "late-import Run control");
      await env.click(modal().querySelector("button.mod-cta"));
      await c.waitFor(() => releaseImport, "real import completed before publication");
      const replacement = await openDrawing("excaliai-import-replacement-" + variant);
      const before = JSON.stringify(replacement.excalidrawAPI.getSceneElements());
      const notices = new Set(doc.querySelectorAll(".notice"));
      releaseImport();
      pauseImport = "";
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      check(
        JSON.stringify(replacement.excalidrawAPI.getSceneElements()) === before,
        "late " + variant + " import changed a replacement drawing",
      );
      check(
        ![...doc.querySelectorAll(".notice")].some((notice) => !notices.has(notice)),
        "retiring during an import displayed an error notice",
      );
      return {
        assertions: [
          "a completed real import cannot publish after its originating file retires",
          "no failure notice is needed for a retired target",
        ],
      };
    });
  }
}
