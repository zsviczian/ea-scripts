/** Public task helpers shared by the modal and regression tests. */
type TaskHelpers = {
  EXCALIAI_SETTINGS_VERSION: number;
  DEFAULT_IMAGE_SIZE: string;
  TASK_EXECUTION_MODES: {
    TEXT_RESULT: string;
    IMAGE_PROMPT: string;
    IMAGE_DIRECT: string;
    IMAGE_EDIT: string;
  };
  TASK_RESULT_TYPES: {
    HTML: string;
    MINDMAP: string;
    MERMAID: string;
    SVG: string;
    IMAGE: string;
    IMAGE_SILENT: string;
  };
  TASK_INPUT_RULES: { DISABLED: string; OPTIONAL: string; REQUIRED: string };
  TASK_MASK_MODES: { DISABLED: string; OPTIONAL: string; REQUIRED: string };
  TASK_RUNTIME_APIS: { NONE: string; MINDMAP_BUILDER: string };
  VALID_TASK_EXECUTION_MODES: string[];
  VALID_TASK_RESULT_TYPES: string[];
  VALID_TASK_INPUT_RULES: string[];
  VALID_TASK_MASK_MODES: string[];
  VALID_TASK_RUNTIME_APIS: string[];
  TASK_EXECUTION_MODE_META: Record<string, TaskExecutionMeta>;
  TASK_RESULT_TYPE_META: Record<string, TaskResultMeta>;
  getTaskExecutionModeMeta: (mode: string) => TaskExecutionMeta;
  getTaskExecutionModeLabel: (mode: string) => string;
  getTaskExecutionModeDescription: (mode: string) => string;
  getTaskResultTypeMeta: (resultType: string) => TaskResultMeta;
  getTaskResultTypeLabel: (resultType: string) => string;
  getTaskResultTypeDescription: (resultType: string) => string;
  getTaskRuntimeRequirement: (taskConfig?: TaskConfig | null) => string;
  getTaskRuntimeRequirementLabel: (runtimeRequirement: string) => string;
  normalizeEnumValue: (
    value: unknown,
    validValues: readonly string[],
    fallbackValue: string,
  ) => string;
  cloneJSON: <T>(value: T) => T;
  createTaskIdFromName: (value?: string) => string;
  getDefaultOutputInstruction: (resultType: string) => string;
  getDefaultResultTypeForMode: (mode: string) => string;
  normalizeTaskConfig: (task?: TaskConfigInput, index?: number) => TaskConfig;
  normalizeTaskConfigs: (
    tasks: unknown,
    { fallbackToDefaults }?: { fallbackToDefaults?: boolean | undefined },
  ) => TaskConfig[];
  createDefaultTaskConfigs: () => TaskConfigInput[];
  DEFAULT_TASK_CONFIGS: TaskConfig[];
  DEFAULT_TASK_ID: string;
  createDefaultState: (taskConfigs?: TaskConfig[]) => ExcaliAIState;
  normalizeState: (state?: Record<string, unknown>, taskConfigs?: TaskConfig[]) => ExcaliAIState;
  createDefaultExcaliAISettings: () => ExcaliAISettings;
  LEGACY_TASK_NAME_TO_ID: { [k: string]: string };
  loadExcaliAISettings: (rawSettings: unknown) => {
    settings: ExcaliAISettings;
    needsSave: boolean;
  };
};
import type { Translator } from "../../sharedUtils/i18n";
import type { ExcaliAITranslationKey } from "./lang/en";
import type {
  TaskConfig,
  TaskConfigInput,
  TaskExecutionMeta,
  TaskResultMeta,
  ExcaliAIState,
  ExcaliAISettings,
  LegacyExcaliAISettings,
} from "./types";
/** Import-safe task definitions and legacy settings migration, preserved from ExcaliAI. */
export const createTaskHelpers = (t: Translator<ExcaliAITranslationKey>): TaskHelpers => {
  const EXCALIAI_SETTINGS_VERSION = 1;
  const DEFAULT_IMAGE_SIZE = "1024x1024";

  const TASK_EXECUTION_MODES = {
    TEXT_RESULT: "text-result",
    IMAGE_PROMPT: "image-prompt",
    IMAGE_DIRECT: "image-direct",
    IMAGE_EDIT: "image-edit",
  };

  const TASK_RESULT_TYPES = {
    HTML: "html",
    MINDMAP: "mindmap",
    MERMAID: "mermaid",
    SVG: "svg",
    IMAGE: "image",
    IMAGE_SILENT: "image-silent",
  };

  const TASK_INPUT_RULES = {
    DISABLED: "disabled",
    OPTIONAL: "optional",
    REQUIRED: "required",
  };

  const TASK_MASK_MODES = {
    DISABLED: "disabled",
    OPTIONAL: "optional",
    REQUIRED: "required",
  };

  const TASK_RUNTIME_APIS = {
    NONE: "",
    MINDMAP_BUILDER: "mindmap-builder",
  };

  const VALID_TASK_EXECUTION_MODES = Object.values(TASK_EXECUTION_MODES);
  const VALID_TASK_RESULT_TYPES = Object.values(TASK_RESULT_TYPES);
  const VALID_TASK_INPUT_RULES = Object.values(TASK_INPUT_RULES);
  const VALID_TASK_MASK_MODES = Object.values(TASK_MASK_MODES);
  const VALID_TASK_RUNTIME_APIS = Object.values(TASK_RUNTIME_APIS);

  const TASK_EXECUTION_MODE_META: Record<string, TaskExecutionMeta> = {
    [TASK_EXECUTION_MODES.TEXT_RESULT]: {
      label: t("textResponse"),
      description: t("usesTheTextOrMultimodalModelAnd"),
    },
    [TASK_EXECUTION_MODES.IMAGE_PROMPT]: {
      label: t("writePromptThenGenerateImage"),
      description: t("usesTheTextModelToWriteAn"),
    },
    [TASK_EXECUTION_MODES.IMAGE_DIRECT]: {
      label: t("sendPromptStraightToImageModel"),
      description: t("sendsOnlyTheUserSPromptTo"),
    },
    [TASK_EXECUTION_MODES.IMAGE_EDIT]: {
      label: t("editSelectedImage"),
      description: t("usesTheSelectedImageAsTheSource"),
    },
  };

  const TASK_RESULT_TYPE_META: Record<string, TaskResultMeta> = {
    [TASK_RESULT_TYPES.HTML]: {
      label: "HTML",
      description: t("embedsTheResponseAsASingleHtml"),
    },
    [TASK_RESULT_TYPES.MINDMAP]: {
      label: t("mindMap"),
      description: t("importsTheResponseIntoMindmapBuilder"),
      runtimeRequirement: TASK_RUNTIME_APIS.MINDMAP_BUILDER,
    },
    [TASK_RESULT_TYPES.MERMAID]: {
      label: t("mermaid"),
      description: t("createsAMermaidDiagram"),
    },
    [TASK_RESULT_TYPES.SVG]: {
      label: t("excalidrawStrokes"),
      description: t("usesSvgBehindTheScenesToGenerate"),
    },
    [TASK_RESULT_TYPES.IMAGE]: {
      label: t("imagePromptNote"),
      description: t("generatesAnImageAndAddsTheModel"),
    },
    [TASK_RESULT_TYPES.IMAGE_SILENT]: {
      label: t("imageOnly"),
      description: t("generatesOnlyTheImageWithoutAddingThe"),
    },
  };

  const getTaskExecutionModeMeta = (mode: string): TaskExecutionMeta =>
    TASK_EXECUTION_MODE_META[mode] ?? TASK_EXECUTION_MODE_META[TASK_EXECUTION_MODES.TEXT_RESULT]!;

  const getTaskExecutionModeLabel = (mode: string): string => getTaskExecutionModeMeta(mode).label;

  const getTaskExecutionModeDescription = (mode: string): string =>
    getTaskExecutionModeMeta(mode).description;

  const getTaskResultTypeMeta = (resultType: string): TaskResultMeta =>
    TASK_RESULT_TYPE_META[resultType] ?? TASK_RESULT_TYPE_META[TASK_RESULT_TYPES.HTML]!;

  const getTaskResultTypeLabel = (resultType: string): string =>
    getTaskResultTypeMeta(resultType).label;

  const getTaskResultTypeDescription = (resultType: string): string =>
    getTaskResultTypeMeta(resultType).description;

  const getTaskRuntimeRequirement = (taskConfig?: TaskConfig | null): string =>
    getTaskResultTypeMeta(taskConfig?.execution?.resultType ?? TASK_RESULT_TYPES.HTML)
      .runtimeRequirement ?? TASK_RUNTIME_APIS.NONE;

  const getTaskRuntimeRequirementLabel = (runtimeRequirement: string): string => {
    switch (runtimeRequirement) {
      case TASK_RUNTIME_APIS.MINDMAP_BUILDER:
        return t("mindmapBuilder");
      default:
        return t("none");
    }
  };

  const normalizeEnumValue = (
    value: unknown,
    validValues: readonly string[],
    fallbackValue: string,
  ): string => (typeof value === "string" && validValues.includes(value) ? value : fallbackValue);

  const cloneJSON = <T>(value: T): T => {
    if (value === null || value === undefined) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  };

  const createTaskIdFromName = (value = ""): string => {
    const normalizedValue = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalizedValue || "task";
  };

  const getDefaultOutputInstruction = (resultType: string): string => {
    switch (resultType) {
      case TASK_RESULT_TYPES.HTML:
        return t("turnThisIntoASingleHtmlFile");
      case TASK_RESULT_TYPES.MINDMAP:
        return t("returnOnlyTheMindMapAsPlain");
      case TASK_RESULT_TYPES.MERMAID:
        return t("returnASingleMessageContainingOnlyThe");
      case TASK_RESULT_TYPES.SVG:
        return t("returnASingleMessageContainingOnlyThe2");
      case TASK_RESULT_TYPES.IMAGE:
      case TASK_RESULT_TYPES.IMAGE_SILENT:
        return t("returnASingleMessageWithTheGenerated");
      default:
        return "";
    }
  };

  const getDefaultResultTypeForMode = (mode: string): string => {
    switch (mode) {
      case TASK_EXECUTION_MODES.IMAGE_PROMPT:
      case TASK_EXECUTION_MODES.IMAGE_DIRECT:
      case TASK_EXECUTION_MODES.IMAGE_EDIT:
        return TASK_RESULT_TYPES.IMAGE;
      default:
        return TASK_RESULT_TYPES.HTML;
    }
  };

  const normalizeTaskConfig = (task: TaskConfigInput = {}, index = 0): TaskConfig => {
    const execution = task.execution ?? {};
    const mode = normalizeEnumValue(
      execution.mode,
      VALID_TASK_EXECUTION_MODES,
      TASK_EXECUTION_MODES.TEXT_RESULT,
    );
    const resultType = normalizeEnumValue(
      execution.resultType,
      VALID_TASK_RESULT_TYPES,
      getDefaultResultTypeForMode(mode),
    );
    const imageInputFallback =
      mode === TASK_EXECUTION_MODES.IMAGE_DIRECT
        ? TASK_INPUT_RULES.DISABLED
        : mode === TASK_EXECUTION_MODES.IMAGE_EDIT
          ? TASK_INPUT_RULES.REQUIRED
          : TASK_INPUT_RULES.OPTIONAL;

    return {
      id: createTaskIdFromName(task.id ?? task.name ?? `task-${index + 1}`),
      name: String(task.name ?? "").trim() || t("task", { value1: index + 1 }),
      help: String(task.help ?? "").trim(),
      systemPrompt:
        task.systemPrompt === null || task.systemPrompt === undefined
          ? null
          : String(task.systemPrompt),
      outputInstruction: String(task.outputInstruction ?? getDefaultOutputInstruction(resultType)),
      execution: {
        mode,
        resultType,
        userPrompt: normalizeEnumValue(
          execution.userPrompt,
          VALID_TASK_INPUT_RULES,
          TASK_INPUT_RULES.OPTIONAL,
        ),
        imageInput: normalizeEnumValue(
          execution.imageInput,
          VALID_TASK_INPUT_RULES,
          imageInputFallback,
        ),
        maskMode: normalizeEnumValue(
          execution.maskMode,
          VALID_TASK_MASK_MODES,
          mode === TASK_EXECUTION_MODES.IMAGE_EDIT
            ? TASK_MASK_MODES.OPTIONAL
            : TASK_MASK_MODES.DISABLED,
        ),
        requiresApi: getTaskResultTypeMeta(resultType).runtimeRequirement ?? TASK_RUNTIME_APIS.NONE,
      },
    };
  };

  const normalizeTaskConfigs = (
    tasks: unknown,
    { fallbackToDefaults = false } = {},
  ): TaskConfig[] => {
    if (!Array.isArray(tasks)) {
      return fallbackToDefaults ? normalizeTaskConfigs(createDefaultTaskConfigs()) : [];
    }

    const usedIds = new Set();
    return tasks.map((task, index) => {
      const normalizedTask = normalizeTaskConfig(task, index);
      if (normalizedTask.execution.mode !== TASK_EXECUTION_MODES.IMAGE_EDIT) {
        normalizedTask.execution.maskMode = TASK_MASK_MODES.DISABLED;
      }
      let nextId =
        normalizedTask.id || createTaskIdFromName(normalizedTask.name) || `task-${index + 1}`;
      let duplicateCount = 2;
      while (usedIds.has(nextId)) {
        nextId = `${normalizedTask.id}-${duplicateCount++}`;
      }
      usedIds.add(nextId);
      normalizedTask.id = nextId;
      return normalizedTask;
    });
  };

  const createDefaultTaskConfigs = (): TaskConfigInput[] => [
    {
      id: "challenge-my-thinking",
      name: t("challengeMyThinking"),
      help: t("turnTheSelectedImageAndOptionalPrompt"),
      systemPrompt: t("yourTaskIsToInterpretAScreenshot"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.MERMAID),
      execution: {
        mode: TASK_EXECUTION_MODES.TEXT_RESULT,
        resultType: TASK_RESULT_TYPES.MERMAID,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "convert-sketch-to-shapes",
      name: t("convertSketchToShapes"),
      help: t("convertSelectedSketchesIntoExcalidrawStrokesWorks"),
      systemPrompt: t("givenAnImageFeaturingVariousGeometricShapes"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.SVG),
      execution: {
        mode: TASK_EXECUTION_MODES.TEXT_RESULT,
        resultType: TASK_RESULT_TYPES.SVG,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "create-a-simple-excalidraw-icon",
      name: t("createASimpleExcalidrawIcon"),
      help: t("turnATextPromptIntoASimple"),
      systemPrompt: t("givenADescriptionOfAnSvgImage"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.SVG),
      execution: {
        mode: TASK_EXECUTION_MODES.TEXT_RESULT,
        resultType: TASK_RESULT_TYPES.SVG,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.DISABLED,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "create-a-stick-figure",
      name: t("createAStickFigure"),
      help: t("sendOnlyTheTextPromptToThe"),
      systemPrompt: t("youWillReceiveAPromptFromThe"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.IMAGE),
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_PROMPT,
        resultType: TASK_RESULT_TYPES.IMAGE,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.DISABLED,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "edit-an-image",
      name: t("editAnImage"),
      help: t("imageElementsAreUsedAsTheSource"),
      systemPrompt: null,
      outputInstruction: "",
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_EDIT,
        resultType: TASK_RESULT_TYPES.IMAGE,
        userPrompt: TASK_INPUT_RULES.REQUIRED,
        imageInput: TASK_INPUT_RULES.REQUIRED,
        maskMode: TASK_MASK_MODES.OPTIONAL,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "generate-an-image-from-image-and-prompt",
      name: t("generateAnImageFromImageAndPrompt"),
      help: t("generateAnImageFromTheSelectedImage"),
      systemPrompt: t("yourTaskInvolvesReceivingAnImageAnd"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.IMAGE),
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_PROMPT,
        resultType: TASK_RESULT_TYPES.IMAGE,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "generate-an-image-from-prompt",
      name: t("generateAnImageFromPrompt"),
      help: t("sendOnlyTheTextPromptToThe"),
      systemPrompt: null,
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.IMAGE),
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_DIRECT,
        resultType: TASK_RESULT_TYPES.IMAGE,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.DISABLED,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "generate-an-image-to-illustrate-a-quote",
      name: t("generateAnImageToIllustrateAQuote"),
      help: t("turnAQuoteIntoAnIllustratedScene"),
      systemPrompt: t("yourTaskInvolvesTransformingAUserProvided"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.IMAGE),
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_PROMPT,
        resultType: TASK_RESULT_TYPES.IMAGE,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.DISABLED,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "generate-4-icon-variants-based-on-input-image",
      name: t("generateIconVariantsBasedOnInputImage"),
      help: t("generateAXSheetOfFourIcon"),
      systemPrompt: t("givenASimpleSketchAndAnOptional"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.IMAGE_SILENT),
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_PROMPT,
        resultType: TASK_RESULT_TYPES.IMAGE_SILENT,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "visual-brainstorm",
      name: t("visualBrainstorm"),
      help: t("generateAnImageFromTheSelectedImage2"),
      systemPrompt: t("yourObjectiveIsToInterpretAScreenshot"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.IMAGE),
      execution: {
        mode: TASK_EXECUTION_MODES.IMAGE_PROMPT,
        resultType: TASK_RESULT_TYPES.IMAGE,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "wireframe-to-code",
      name: t("wireframeToCode"),
      help: t("interpretTheSelectedWireframeAndGenerateA"),
      systemPrompt: t("youAreAnExpertTailwindDeveloperA"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.HTML),
      execution: {
        mode: TASK_EXECUTION_MODES.TEXT_RESULT,
        resultType: TASK_RESULT_TYPES.HTML,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.NONE,
      },
    },
    {
      id: "create-mindmap",
      name: t("createMindmap"),
      help: t("createAHierarchicalMindMapFromThe"),
      systemPrompt: t("youWillReceiveATextPromptAnd"),
      outputInstruction: getDefaultOutputInstruction(TASK_RESULT_TYPES.MINDMAP),
      execution: {
        mode: TASK_EXECUTION_MODES.TEXT_RESULT,
        resultType: TASK_RESULT_TYPES.MINDMAP,
        userPrompt: TASK_INPUT_RULES.OPTIONAL,
        imageInput: TASK_INPUT_RULES.OPTIONAL,
        maskMode: TASK_MASK_MODES.DISABLED,
        requiresApi: TASK_RUNTIME_APIS.MINDMAP_BUILDER,
      },
    },
  ];

  const DEFAULT_TASK_CONFIGS = normalizeTaskConfigs(createDefaultTaskConfigs());
  const DEFAULT_TASK_ID =
    DEFAULT_TASK_CONFIGS.find((task) => task.id === "wireframe-to-code")?.id ??
    DEFAULT_TASK_CONFIGS[0]?.id ??
    "";

  const createDefaultState = (taskConfigs: TaskConfig[] = []): ExcaliAIState => ({
    selectedTaskId:
      taskConfigs.find((task) => task.id === DEFAULT_TASK_ID)?.id ?? taskConfigs[0]?.id ?? "",
    userPrompt: "",
    maskEdit: true,
    textModel: "",
    imageModel: "",
    maxTokens: "",
    imageSize: DEFAULT_IMAGE_SIZE,
  });

  const normalizeState = (
    state: Record<string, unknown> = {},
    taskConfigs: TaskConfig[] = [],
  ): ExcaliAIState => {
    const defaultState = createDefaultState(taskConfigs);
    const knownTaskIds = new Set(taskConfigs.map((task) => task.id));
    const selectedTaskId = String(state.selectedTaskId ?? defaultState.selectedTaskId).trim();
    return {
      selectedTaskId: knownTaskIds.has(selectedTaskId)
        ? selectedTaskId
        : defaultState.selectedTaskId,
      userPrompt: String(state.userPrompt ?? defaultState.userPrompt),
      maskEdit: state.maskEdit !== false,
      textModel: String(state.textModel ?? defaultState.textModel),
      imageModel: String(state.imageModel ?? defaultState.imageModel),
      maxTokens: String(state.maxTokens ?? defaultState.maxTokens).trim(),
      imageSize: String(state.imageSize ?? defaultState.imageSize).trim() || defaultState.imageSize,
    };
  };

  const createDefaultExcaliAISettings = (): ExcaliAISettings => ({
    schemaVersion: EXCALIAI_SETTINGS_VERSION,
    config: {
      tasks: cloneJSON(DEFAULT_TASK_CONFIGS),
    },
    state: createDefaultState(DEFAULT_TASK_CONFIGS),
  });

  const LEGACY_TASK_NAME_TO_ID = Object.fromEntries(
    DEFAULT_TASK_CONFIGS.map((task) => [task.name, task.id]),
  );

  const loadExcaliAISettings = (
    rawSettings: unknown,
  ): { settings: ExcaliAISettings; needsSave: boolean } => {
    const sourceSettings = (
      rawSettings && typeof rawSettings === "object" ? rawSettings : {}
    ) as LegacyExcaliAISettings;
    const normalizedSettings = createDefaultExcaliAISettings();
    normalizedSettings.config.tasks = normalizeTaskConfigs(sourceSettings.config?.tasks, {
      fallbackToDefaults: true,
    });

    const legacyState = {
      selectedTaskId:
        LEGACY_TASK_NAME_TO_ID[String(sourceSettings["Agent's Task"] ?? "").trim()] ??
        normalizedSettings.state.selectedTaskId,
      userPrompt: sourceSettings["User Prompt"] ?? normalizedSettings.state.userPrompt,
      maskEdit: sourceSettings["Mask Edit"] !== false,
      textModel: sourceSettings["Text Model"] ?? normalizedSettings.state.textModel,
      imageModel: sourceSettings["Image Model"] ?? normalizedSettings.state.imageModel,
      maxTokens: sourceSettings["Max Tokens"] ?? normalizedSettings.state.maxTokens,
      imageSize: sourceSettings["Image Size"] ?? normalizedSettings.state.imageSize,
    };

    normalizedSettings.state = normalizeState(
      {
        ...legacyState,
        ...(sourceSettings.state ?? {}),
      },
      normalizedSettings.config.tasks,
    );

    return {
      settings: normalizedSettings,
      needsSave: JSON.stringify(sourceSettings) !== JSON.stringify(normalizedSettings),
    };
  };

  return {
    EXCALIAI_SETTINGS_VERSION,
    DEFAULT_IMAGE_SIZE,
    TASK_EXECUTION_MODES,
    TASK_RESULT_TYPES,
    TASK_INPUT_RULES,
    TASK_MASK_MODES,
    TASK_RUNTIME_APIS,
    VALID_TASK_EXECUTION_MODES,
    VALID_TASK_RESULT_TYPES,
    VALID_TASK_INPUT_RULES,
    VALID_TASK_MASK_MODES,
    VALID_TASK_RUNTIME_APIS,
    TASK_EXECUTION_MODE_META,
    TASK_RESULT_TYPE_META,
    getTaskExecutionModeMeta,
    getTaskExecutionModeLabel,
    getTaskExecutionModeDescription,
    getTaskResultTypeMeta,
    getTaskResultTypeLabel,
    getTaskResultTypeDescription,
    getTaskRuntimeRequirement,
    getTaskRuntimeRequirementLabel,
    normalizeEnumValue,
    cloneJSON,
    createTaskIdFromName,
    getDefaultOutputInstruction,
    getDefaultResultTypeForMode,
    normalizeTaskConfig,
    normalizeTaskConfigs,
    createDefaultTaskConfigs,
    DEFAULT_TASK_CONFIGS,
    DEFAULT_TASK_ID,
    createDefaultState,
    normalizeState,
    createDefaultExcaliAISettings,
    LEGACY_TASK_NAME_TO_ID,
    loadExcaliAISettings,
  };
};
