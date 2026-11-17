/**
 * ExcaliAI's existing modal, export, request and insertion workflow.
 * Kept intact during migration; pure task/response/request helpers are import-safe.
 */
import { createTaskHelpers } from "./tasks";
import { createExcaliAITranslator } from "./lang";
import { getTextModelRequest } from "./requests";
import {
  getGeneratedImageSource,
  getResultFinishReason,
  isMaxTokenFinishReason,
  extractStructuredContent as extractAIContent,
} from "./responses";
export async function runExcaliAI(ea, utils) {
  const { Notice } = ea.obsidian;
  const t = createExcaliAITranslator(ea.obsidian.moment.locale());
  if (!ea.targetView) {
    new Notice(t("noView"));
    return;
  }
  const originView = ea.targetView;
  const originAPI = ea.getExcalidrawAPI();
  const originFilePath = originView.file?.path;
  const isViewAlive = () =>
    ea.targetView === originView &&
    originView.excalidrawAPI === originAPI &&
    originView.file?.path === originFilePath &&
    !originView.isClosingOrMigrating();
  const app = originView.app;
  const document = ea.targetView.containerEl.ownerDocument;
  const {
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
  } = createTaskHelpers(t);
  let dirty = false;

  if (!ea.verifyMinimumPluginVersion || !ea.verifyMinimumPluginVersion("2.29.2")) {
    new Notice(t("requiresVersion"));
    return;
  }

  // --------------------------------------
  // Initialize values and settings
  // --------------------------------------
  let settings = ea.getScriptSettings();
  const loadedExcaliAISettings = loadExcaliAISettings(settings);
  settings = loadedExcaliAISettings.settings;
  if (loadedExcaliAISettings.needsSave) {
    await ea.setScriptSettings(settings);
  }

  let userPrompt = settings.state.userPrompt ?? "";
  let selectedTaskId = settings.state.selectedTaskId;
  let imageSize = settings.state.imageSize ?? DEFAULT_IMAGE_SIZE;
  let selectedTextModel = settings.state.textModel ?? "";
  let selectedImageModel = settings.state.imageModel ?? "";
  let selectedMaxTokens = String(settings.state.maxTokens ?? "").trim();
  let prefersMaskEdit = settings.state.maskEdit !== false;

  const aiSettings = ea.getAISettings();
  if (!aiSettings?.enabled) {
    new Notice(t("excalidrawAiIsDisabledOrUnavailableEnable"));
    return;
  }
  let textModel, imageModel, validSizes;
  let imageDataURL = null;
  let maskDataURL = null;

  const parsePositiveInteger = (value) => {
    const normalizedValue = String(value ?? "").trim();
    if (!normalizedValue) {
      return null;
    }

    const parsedValue = parseInt(normalizedValue, 10);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      return null;
    }

    return parsedValue;
  };

  const getTaskConfigs = () => settings.config?.tasks ?? [];

  const isTaskRuntimeAvailable = (taskConfig) => {
    switch (getTaskRuntimeRequirement(taskConfig)) {
      case TASK_RUNTIME_APIS.MINDMAP_BUILDER:
        return Boolean(window?.MindMapBuilderAPI);
      default:
        return true;
    }
  };

  const getVisibleTaskConfigs = () => getTaskConfigs().filter(isTaskRuntimeAvailable);

  const getTaskConfigById = (taskId = selectedTaskId) =>
    getTaskConfigs().find((taskConfig) => taskConfig.id === taskId) ?? null;

  const getVisibleTaskConfigById = (taskId = selectedTaskId) =>
    getVisibleTaskConfigs().find((taskConfig) => taskConfig.id === taskId) ?? null;

  const ensureSelectedTaskId = () => {
    const activeVisibleTask = getVisibleTaskConfigById(selectedTaskId);
    const fallbackTask = activeVisibleTask ?? getVisibleTaskConfigs()[0] ?? null;
    const nextTaskId = fallbackTask?.id ?? "";
    if (selectedTaskId !== nextTaskId) {
      selectedTaskId = nextTaskId;
      dirty = true;
    }
    return fallbackTask;
  };

  const getActiveTaskConfig = () => ensureSelectedTaskId();

  const getTaskExecutionConfig = (taskId = selectedTaskId) =>
    getTaskConfigById(taskId)?.execution ?? null;

  const getTaskOutputType = (taskId = selectedTaskId) => {
    const taskConfig = typeof taskId === "string" ? getTaskConfigById(taskId) : taskId;
    return {
      instruction: taskConfig?.outputInstruction ?? "",
      blocktype: taskConfig?.execution?.resultType ?? TASK_RESULT_TYPES.HTML,
    };
  };

  const isImageEditTask = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.mode === TASK_EXECUTION_MODES.IMAGE_EDIT;

  const isImageGenerationTask = (taskId = selectedTaskId) => {
    const mode = getTaskExecutionConfig(taskId)?.mode;
    return (
      mode === TASK_EXECUTION_MODES.IMAGE_PROMPT ||
      mode === TASK_EXECUTION_MODES.IMAGE_DIRECT ||
      mode === TASK_EXECUTION_MODES.IMAGE_EDIT
    );
  };

  const doesTaskUseTextModel = (taskId = selectedTaskId) => {
    const mode = getTaskExecutionConfig(taskId)?.mode;
    return mode === TASK_EXECUTION_MODES.TEXT_RESULT || mode === TASK_EXECUTION_MODES.IMAGE_PROMPT;
  };

  const doesTaskAllowUserPrompt = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.userPrompt !== TASK_INPUT_RULES.DISABLED;

  const taskRequiresUserPrompt = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.userPrompt === TASK_INPUT_RULES.REQUIRED;

  const doesTaskAllowImageInput = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.imageInput !== TASK_INPUT_RULES.DISABLED;

  const taskRequiresImageInput = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.imageInput === TASK_INPUT_RULES.REQUIRED;

  const taskUsesDirectImageModel = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.mode === TASK_EXECUTION_MODES.IMAGE_DIRECT;

  const taskUsesImagePromptPipeline = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.mode === TASK_EXECUTION_MODES.IMAGE_PROMPT;

  const getTaskMaskMode = (taskId = selectedTaskId) =>
    getTaskExecutionConfig(taskId)?.maskMode ?? TASK_MASK_MODES.DISABLED;

  const getTaskConfigValidationMessage = (taskConfig = getActiveTaskConfig()) => {
    if (!taskConfig) {
      return t("noRunnableAiTasksAreConfiguredOpen");
    }

    const { mode, resultType, maskMode } = taskConfig.execution;
    const isImageResultType =
      resultType === TASK_RESULT_TYPES.IMAGE || resultType === TASK_RESULT_TYPES.IMAGE_SILENT;

    if (mode === TASK_EXECUTION_MODES.TEXT_RESULT && isImageResultType) {
      return t("taskUsesAnImageResultWithUse", {
        value1: taskConfig.name,
        value2: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.TEXT_RESULT),
        value3: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_PROMPT),
        value4: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_DIRECT),
      });
    }

    if (mode === TASK_EXECUTION_MODES.IMAGE_PROMPT && !isImageResultType) {
      return t("taskMustUseAnImageResultWhen", {
        value1: taskConfig.name,
        value2: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_PROMPT),
      });
    }

    if (mode === TASK_EXECUTION_MODES.IMAGE_DIRECT && !isImageResultType) {
      return t("taskMustUseAnImageResultWhen", {
        value1: taskConfig.name,
        value2: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_DIRECT),
      });
    }

    if (
      mode === TASK_EXECUTION_MODES.IMAGE_DIRECT &&
      taskConfig.execution.imageInput !== TASK_INPUT_RULES.DISABLED
    ) {
      return t("taskCannotSendACanvasImageWhen", {
        value1: taskConfig.name,
        value2: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_DIRECT),
      });
    }

    if (mode === TASK_EXECUTION_MODES.IMAGE_EDIT && resultType !== TASK_RESULT_TYPES.IMAGE) {
      return t("taskMustUseTheImageResultWhen", {
        value1: taskConfig.name,
        value2: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_EDIT),
      });
    }

    if (mode !== TASK_EXECUTION_MODES.IMAGE_EDIT && maskMode !== TASK_MASK_MODES.DISABLED) {
      return t("taskCanOnlyEnableMaskModeWhen", {
        value1: taskConfig.name,
        value2: getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_EDIT),
      });
    }

    return "";
  };

  const getConfiguredTextMaxTokens = () => {
    const scriptOverride = parsePositiveInteger(selectedMaxTokens);
    if (scriptOverride) {
      return scriptOverride;
    }

    const pluginDefault = parsePositiveInteger(aiSettings.defaultMaxResponseTokens);
    return pluginDefault;
  };

  const getProviderProfiles = () => aiSettings.providerProfiles ?? {};

  const getTextModelConfigs = () => aiSettings.textModels ?? {};

  const getImageModelConfigs = () => aiSettings.imageModels ?? {};

  const hasConfiguredProviderApiKey = (providerId) =>
    Boolean(getProviderProfiles()[providerId]?.hasApiKey);

  const getConfiguredModelIdsForKind = (kind) => {
    const configs = kind === "text" ? getTextModelConfigs() : getImageModelConfigs();

    return Object.keys(configs)
      .filter((modelId) => hasConfiguredProviderApiKey(configs[modelId]?.providerId))
      .sort((left, right) => left.localeCompare(right));
  };

  const getMissingModelConfigurationMessage = (kind) => {
    if (kind === "text") {
      return t("noTextOrMultimodalModelsAreReady");
    }

    return t("noImageModelsAreReadyToUse");
  };

  const getConfiguredTextModel = () =>
    (doesTaskAllowImageInput() && imageDataURL
      ? aiSettings.defaultMultimodalTextModel
      : aiSettings.defaultTextModel) ||
    aiSettings.defaultTextModel ||
    aiSettings.defaultMultimodalTextModel ||
    getConfiguredModelIdsForKind("text")[0] ||
    "";

  const getConfiguredImageModel = () =>
    aiSettings.defaultImageModel || getConfiguredModelIdsForKind("image")[0] || "";

  const getModelConfigId = (configs, modelId) => {
    if (configs[modelId]) {
      return modelId;
    }
    return Object.keys(configs).find((configId) => configs[configId]?.model === modelId) ?? "";
  };

  const getTextModelConfigId = (modelId) => getModelConfigId(getTextModelConfigs(), modelId);

  const getImageModelConfigId = (modelId) => {
    return getModelConfigId(getImageModelConfigs(), modelId);
  };

  const getTextModelConfig = (modelId) => {
    const configId = getTextModelConfigId(modelId);
    return configId ? (getTextModelConfigs()[configId] ?? null) : null;
  };

  const getImageModelConfig = (modelId) => {
    const configId = getImageModelConfigId(modelId);
    return configId ? (getImageModelConfigs()[configId] ?? null) : null;
  };

  const getAvailableTextModels = () => {
    const configuredModels = getConfiguredModelIdsForKind("text");
    if (configuredModels.length > 0) {
      return configuredModels;
    }
    return [];
  };

  const getAvailableImageModels = () => {
    const configuredModels = getConfiguredModelIdsForKind("image");
    if (configuredModels.length > 0) {
      return configuredModels;
    }
    return [];
  };

  const getValidSizesForModel = (model) => {
    if (!model) {
      return [];
    }
    const configuredSizes = getImageModelConfig(model)
      ?.supportedSizes?.map((size) => size?.trim())
      .filter(Boolean);
    if (configuredSizes?.length) {
      return configuredSizes;
    }
    return ["1024x1024"];
  };

  const parseImageSizeDimensions = (size) => {
    const match = String(size ?? "")
      .trim()
      .match(/^(\d+)x(\d+)$/i);
    if (!match) {
      return null;
    }
    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);
    if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { width, height };
  };

  const greatestCommonDivisor = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
      const remainder = x % y;
      x = y;
      y = remainder;
    }
    return x || 1;
  };

  const CANONICAL_ASPECT_RATIOS = [
    "1:8",
    "1:4",
    "2:3",
    "3:4",
    "4:5",
    "9:16",
    "1:1",
    "16:9",
    "5:4",
    "4:3",
    "3:2",
    "4:1",
    "8:1",
    "21:9",
  ].map((label) => {
    const [width, height] = label.split(":").map((value) => parseInt(value, 10));
    return {
      label,
      ratio: width / height,
    };
  });

  const ASPECT_RATIO_LABEL_RELATIVE_EPSILON = 0.02;

  const getCanonicalAspectRatioLabel = (width, height) => {
    const ratio = width / height;
    const nearest = CANONICAL_ASPECT_RATIOS.map((candidate) => ({
      ...candidate,
      delta: Math.abs(candidate.ratio - ratio),
    })).sort((left, right) => left.delta - right.delta)[0];

    if (
      nearest &&
      nearest.delta / Math.max(nearest.ratio, Number.EPSILON) <= ASPECT_RATIO_LABEL_RELATIVE_EPSILON
    ) {
      return nearest.label;
    }

    const divisor = greatestCommonDivisor(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  };

  const getAspectRatioLabelFromDimensions = (width, height) => {
    return getCanonicalAspectRatioLabel(width, height);
  };

  const getImageSizeDropdownOptions = (sizes = []) => {
    return sizes
      .map((size) => {
        const dimensions = parseImageSizeDimensions(size);
        if (!dimensions) {
          return {
            value: size,
            label: String(size ?? ""),
            ratioOrder: Number.POSITIVE_INFINITY,
            pixels: Number.POSITIVE_INFINITY,
            width: Number.POSITIVE_INFINITY,
            height: Number.POSITIVE_INFINITY,
          };
        }

        const ratioLabel = getAspectRatioLabelFromDimensions(dimensions.width, dimensions.height);
        return {
          value: size,
          label: `(${ratioLabel}) ${dimensions.width}x${dimensions.height}`,
          ratioOrder: dimensions.width / dimensions.height,
          pixels: dimensions.width * dimensions.height,
          width: dimensions.width,
          height: dimensions.height,
        };
      })
      .sort((left, right) => {
        if (left.ratioOrder !== right.ratioOrder) {
          return left.ratioOrder - right.ratioOrder;
        }
        if (left.pixels !== right.pixels) {
          return left.pixels - right.pixels;
        }
        if (left.width !== right.width) {
          return left.width - right.width;
        }
        if (left.height !== right.height) {
          return left.height - right.height;
        }
        return String(left.value).localeCompare(String(right.value));
      });
  };

  const getResolvedTextModelSelection = (requestedModelId = selectedTextModel) => {
    const availableModels = getAvailableTextModels();
    const requestedConfigId = getTextModelConfigId(requestedModelId);
    const configuredDefaultId = getTextModelConfigId(getConfiguredTextModel());
    const resolvedModelId =
      [requestedConfigId, configuredDefaultId, availableModels[0], requestedModelId].find(
        (modelId) => modelId && availableModels.includes(modelId),
      ) || "";
    const modelConfig = getTextModelConfig(resolvedModelId);
    const providerProfiles = getProviderProfiles();
    const providerId = modelConfig?.providerId ?? Object.keys(providerProfiles)[0] ?? "";
    const providerProfile = providerProfiles[providerId] ?? null;

    return {
      modelId: resolvedModelId,
      modelConfig,
      providerId,
      providerProfile,
      requestConfig: getTextModelRequest(resolvedModelId, modelConfig, providerProfile),
    };
  };

  const getResolvedImageModelSelection = (requestedModelId = selectedImageModel) => {
    const availableModels = getAvailableImageModels();
    const requestedConfigId = getImageModelConfigId(requestedModelId);
    const configuredDefaultId = getImageModelConfigId(getConfiguredImageModel());
    const resolvedModelId =
      [requestedConfigId, configuredDefaultId, availableModels[0], requestedModelId].find(
        (modelId) => modelId && availableModels.includes(modelId),
      ) || "";
    const modelConfig = getImageModelConfig(resolvedModelId);
    const providerProfiles = getProviderProfiles();
    const providerId = modelConfig?.providerId ?? Object.keys(providerProfiles)[0] ?? "";
    const providerProfile = providerProfiles[providerId] ?? null;

    return {
      modelId: resolvedModelId,
      modelConfig,
      providerId,
      providerProfile,
      requestConfig: {
        imageModelId: resolvedModelId,
      },
    };
  };

  const getTextModelValidationMessage = (modelId, { requireMultimodal = false } = {}) => {
    if (getAvailableTextModels().length === 0) {
      return getMissingModelConfigurationMessage("text");
    }
    const textSelection = getResolvedTextModelSelection(modelId);
    if (!textSelection.modelConfig) {
      return t("theSelectedTextModelIsnTConfigured", { value1: modelId || "unknown" });
    }
    if (!textSelection.providerProfile) {
      return t("theProviderProfileForTextModelIs", {
        value1: textSelection.providerId || "unknown",
        value2: textSelection.modelId,
      });
    }
    if (!textSelection.providerProfile.hasApiKey) {
      return t("theSelectedProviderProfileDoesnTHave", { value1: textSelection.providerId });
    }
    if (requireMultimodal && textSelection.modelConfig.multimodalSupport === false) {
      return t("theSelectedTextModelIsSetTo", { value1: textSelection.modelId });
    }
    return "";
  };

  const getImageModelValidationMessage = (
    modelId,
    { requirePromptTransformSupport = false, requireMaskEditSupport = false } = {},
  ) => {
    if (getAvailableImageModels().length === 0) {
      return getMissingModelConfigurationMessage("image");
    }
    const imageSelection = getResolvedImageModelSelection(modelId);
    if (!imageSelection.modelConfig) {
      return getMissingModelConfigurationMessage("image");
    }
    if (!imageSelection.providerProfile) {
      return t("theProviderProfileForImageModelIs", {
        value1: imageSelection.providerId || "unknown",
        value2: imageSelection.modelId,
      });
    }
    if (!imageSelection.providerProfile.hasApiKey) {
      return t("theSelectedProviderProfileDoesnTHave", { value1: imageSelection.providerId });
    }
    if (
      requirePromptTransformSupport &&
      imageSelection.modelConfig.supportsPromptImageTransforms === false
    ) {
      return t("theSelectedImageModelDoesnTSupport", { value1: imageSelection.modelId });
    }
    if (requireMaskEditSupport && imageSelection.modelConfig.supportsMaskImageEdits === false) {
      return t("theSelectedImageModelDoesnTSupport2", { value1: imageSelection.modelId });
    }
    return "";
  };

  const getImageRequestErrorMessage = (result, modelId) => {
    const baseMessage = result?.json?.error?.message ?? t("theImageRequestFailed");
    const errorContext = result?.json?.error;
    const imageSelection = getResolvedImageModelSelection(modelId);
    const contextParts = [];
    if (errorContext?.provider) {
      contextParts.push(`provider=${errorContext.provider}`);
    }
    if (errorContext?.status) {
      contextParts.push(`status=${errorContext.status}`);
    }
    if (errorContext?.endpoint) {
      contextParts.push(`endpoint=${errorContext.endpoint}`);
    }
    if (errorContext?.imageRequest?.model) {
      contextParts.push(`model=${errorContext.imageRequest.model}`);
    }
    if (errorContext?.imageRequest?.size) {
      contextParts.push(`size=${errorContext.imageRequest.size}`);
    }
    if (errorContext?.imageRequest?.mode) {
      contextParts.push(`mode=${errorContext.imageRequest.mode}`);
    }
    const contextText = contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";
    return `${baseMessage}${contextText}`;
  };

  const getTaskValidationMessage = ({
    usesTextModel,
    requiresMultimodalText,
    isImageGenRequest,
    isImageEditRequest,
    requiresPromptTransformSupport,
    requiresMaskEditSupport,
    activeTextSelection,
    activeImageSelection,
  }) => {
    if (usesTextModel) {
      const textValidationMessage = getTextModelValidationMessage(activeTextSelection.modelId, {
        requireMultimodal: requiresMultimodalText,
      });
      if (textValidationMessage) {
        return textValidationMessage;
      }
    }

    if (isImageGenRequest || isImageEditRequest) {
      return getImageModelValidationMessage(activeImageSelection.modelId, {
        requirePromptTransformSupport: requiresPromptTransformSupport,
        requireMaskEditSupport: requiresMaskEditSupport,
      });
    }
    return "";
  };

  const getActiveTextModel = () => {
    return getResolvedTextModelSelection(selectedTextModel).modelId;
  };

  const getActiveImageModel = () => {
    return getResolvedImageModelSelection(selectedImageModel).modelId;
  };

  const activeImageModelSupportsMaskEdits = () => {
    const modelConfig = getResolvedImageModelSelection(selectedImageModel).modelConfig;
    return Boolean(modelConfig) && modelConfig.supportsMaskImageEdits !== false;
  };

  const canUseMaskEdit = () =>
    isImageEditTask() &&
    getTaskMaskMode() !== TASK_MASK_MODES.DISABLED &&
    activeImageModelSupportsMaskEdits();

  const shouldUseMaskEdit = () => {
    switch (getTaskMaskMode()) {
      case TASK_MASK_MODES.REQUIRED:
        return canUseMaskEdit();
      case TASK_MASK_MODES.OPTIONAL:
        return canUseMaskEdit() && prefersMaskEdit;
      default:
        return false;
    }
  };

  const shouldGenerateMaskPreview = () => shouldUseMaskEdit();

  const hasAvailableTextModels = () => getAvailableTextModels().length > 0;

  const hasAvailableImageModels = () => getAvailableImageModels().length > 0;

  const parseImageSize = (size) => {
    const [width, height] = (size ?? "1024x1024").split("x").map((value) => parseInt(value, 10));
    if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) {
      return { width: 1024, height: 1024 };
    }
    return { width, height };
  };

  const getEditTargetBoundingBox = (bb, size) => {
    const { width: targetWidth, height: targetHeight } = parseImageSize(size);
    const targetRatio = targetWidth / targetHeight;
    const sourceRatio = bb.width / bb.height;

    let width = bb.width;
    let height = bb.height;
    let topX = bb.topX;
    let topY = bb.topY;

    if (sourceRatio > targetRatio) {
      height = width / targetRatio;
      topY = bb.topY - (height - bb.height) / 2;
    } else if (sourceRatio < targetRatio) {
      width = height * targetRatio;
      topX = bb.topX - (width - bb.width) / 2;
    }

    return { topX, topY, width, height, targetWidth, targetHeight };
  };

  const setTextAndImageModels = () => {
    const nextTextModel = getActiveTextModel();
    if (selectedTextModel !== nextTextModel) {
      dirty = true;
    }
    textModel = nextTextModel;
    selectedTextModel = textModel;

    const nextImageModel = getActiveImageModel();
    if (selectedImageModel !== nextImageModel) {
      dirty = true;
    }
    imageModel = nextImageModel;
    selectedImageModel = imageModel;
    validSizes = imageModel ? getValidSizesForModel(imageModel) : [];
    if (imageModel && !validSizes.includes(imageSize)) {
      imageSize = validSizes[0] ?? "1024x1024";
      dirty = true;
    }
  };
  setTextAndImageModels();

  // --------------------------------------
  // Generate Image Blob From Selected Excalidraw Elements
  // --------------------------------------
  const calculateImageScale = (elements) => {
    const bb = ea.getBoundingBox(elements);
    const size = bb.width * bb.height;
    const minRatio = Math.sqrt(360000 / size);
    const maxRatio = Math.sqrt(size / 16000000);
    return minRatio > 1 ? minRatio : maxRatio > 1 ? 1 / maxRatio : 1;
  };

  const createMask = async (dataURL) => {
    return new Promise((resolve, reject) => {
      const img = document.body.createEl("img");
      img.remove();

      img.onload = () => {
        const canvas = document.body.createEl("canvas");
        canvas.remove();
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          // If opaque (alpha > 0), make it transparent
          if (data[i + 3] > 0) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
          } else if (data[i + 3] === 0) {
            // If fully transparent, make it red
            data[i] = 255; // Red
            data[i + 1] = 0; // Green
            data[i + 2] = 0; // Blue
            data[i + 3] = 255; // make it opaque
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const maskDataURL = canvas.toDataURL();

        resolve(maskDataURL);
      };

      img.onerror = (error) => {
        reject(error);
      };

      img.src = dataURL;
    });
  };

  // For image edits, the selected content is padded to the requested output aspect ratio
  // so the exported image and mask match the requested model size.
  const renderCanvasDataURL = async (view, targetImageEdit = false) => {
    try {
      let PADDING = 5;
      await view.forceSave(true); //to ensure recently embedded PNG and other images are saved to file
      if (!isViewAlive()) return { imageDataURL: null, maskDataURL: null };
      const viewElements = ea.getViewSelectedElements();
      if (viewElements.length === 0) {
        return { imageDataURL: null, maskDataURL: null };
      }
      ea.copyViewElementsToEAforEditing(viewElements, true); //copying the images objects over to EA for PNG generation

      let maskDataURL;
      const loader = ea.getEmbeddedFilesLoader(false);
      let scale = calculateImageScale(ea.getElements());
      const bb = ea.getBoundingBox(viewElements);
      if (
        ea
          .getElements()
          .filter((el) => el.type === "image")
          .some(
            (el) =>
              Math.round(el.width) === Math.round(bb.width) &&
              Math.round(el.height) === Math.round(bb.height),
          )
      ) {
        PADDING = 0;
      }

      let exportSettings = { withBackground: true, withTheme: true };

      if (targetImageEdit) {
        PADDING = 0;
        const strokeColor = ea.style.strokeColor;
        const backgroundColor = ea.style.backgroundColor;
        ea.style.backgroundColor = "transparent";
        ea.style.strokeColor = "transparent";
        const targetBounds = getEditTargetBoundingBox(bb, imageSize);
        const rectID = ea.addRect(
          targetBounds.topX,
          targetBounds.topY,
          targetBounds.width,
          targetBounds.height,
        );
        const rect = ea.getElement(rectID);
        ea.style.strokeColor = strokeColor;
        ea.style.backgroundColor = backgroundColor;
        ea.getElements()
          .filter((el) => el.type === "image")
          .forEach((el) => {
            el.isDeleted = true;
          });

        scale = targetBounds.targetWidth / rect.width;
        exportSettings = { withBackground: false, withTheme: true };
        maskDataURL = await ea.createPNGBase64(
          null,
          scale,
          exportSettings,
          loader,
          "light",
          PADDING,
        );
        maskDataURL = await createMask(maskDataURL);
        ea.getElements()
          .filter((el) => el.type === "image")
          .forEach((el) => {
            el.isDeleted = false;
          });
        ea.getElements()
          .filter((el) => el.type !== "image" && el.id !== rectID)
          .forEach((el) => {
            el.isDeleted = true;
          });
      }

      const imageDataURL = await ea.createPNGBase64(
        null,
        scale,
        exportSettings,
        loader,
        "light",
        PADDING,
      );
      return { imageDataURL, maskDataURL };
    } finally {
      ea.clear();
    }
  };

  // Serialize exports through this EA workbench, including selection-refresh events.
  let pendingPreview = Promise.resolve();
  const generateCanvasDataURL = (view, targetImageEdit = false) => {
    const next = pendingPreview.then(async () => {
      if (!isViewAlive()) return { imageDataURL: null, maskDataURL: null };
      const result = await renderCanvasDataURL(view, targetImageEdit);
      ({ imageDataURL, maskDataURL } = result);
      return result;
    });
    pendingPreview = next.catch(() => {});
    return next;
  };

  ({ imageDataURL, maskDataURL } = await generateCanvasDataURL(
    ea.targetView,
    shouldGenerateMaskPreview(),
  ));

  // --------------------------------------
  // Support functions - embeddable spinner and error
  // --------------------------------------
  const spinner = await ea.convertStringToDataURL(`
  <html><head><style>
    html, body {width: 100%; height: 100%; color: ${ea.getExcalidrawAPI().getAppState().theme === "dark" ? "white" : "black"};}
    body {display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem; overflow: hidden;}
    .Spinner {display: flex; align-items: center; justify-content: center; margin-left: auto; margin-right: auto;}
    .Spinner svg {animation: rotate 1.6s linear infinite; transform-origin: center center; width: 40px; height: 40px;}
    .Spinner circle {stroke: currentColor; animation: dash 1.6s linear 0s infinite; stroke-linecap: round;}
    @keyframes rotate {100% {transform: rotate(360deg);}}
    @keyframes dash {
      0% {stroke-dasharray: 1, 300; stroke-dashoffset: 0;}
      50% {stroke-dasharray: 150, 300; stroke-dashoffset: -200;}
      100% {stroke-dasharray: 1, 300; stroke-dashoffset: -280;}
    }
  </style></head><body>
    <div class="Spinner">
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" stroke-width="8" fill="none" stroke-miter-limit="10"/>
      </svg>
    </div>
    <div>${t("generating")}</div>
  </body></html>`);

  const errorMessage = async (spinnerID, message) => {
    const error = t("somethingWentWrongCheckDeveloperConsoleFor");
    const details = message ? `<p>${message}</p>` : "";
    const errorDataURL = await ea.convertStringToDataURL(`
      <html><head><style>
        html, body {height: 100%;}
        body {display: flex; flex-direction: column; align-items: center; justify-content: center; color: red;}
        h1, h3 {margin-top: 0;margin-bottom: 0.5rem;}
      </style></head><body>
        <h1>${t("errorTitle")}</h1>
        <h3>${error}</h3>${details}
      </body></html>`);
    if (!isViewAlive()) return;
    new Notice(error);
    ea.getElement(spinnerID).link = errorDataURL;
    await ea.addElementsToView(false, true);
  };

  // --------------------------------------
  // Utility to write Mermaid to dialog
  // --------------------------------------
  const EDITOR_LS_KEYS = {
    OAI_API_KEY: "excalidraw-oai-api-key",
    MERMAID_TO_EXCALIDRAW: "mermaid-to-excalidraw",
    PUBLISH_LIBRARY: "publish-library-data",
  };

  const setMermaidDataToStorage = (mermaidDefinition) => {
    try {
      window.localStorage.setItem(
        EDITOR_LS_KEYS.MERMAID_TO_EXCALIDRAW,
        JSON.stringify(mermaidDefinition),
      );
      return true;
    } catch (error) {
      console.warn(t("localstorageSetitemError", { value1: error.message }));
      return false;
    }
  };

  const extractStructuredContent = (rawContent, blocktype) =>
    extractAIContent(rawContent, blocktype, (text) => ea.extractCodeBlocks(text));

  // --------------------------------------
  // Submit Prompt
  // --------------------------------------
  const generateImage = async (text, spinnerID, bb, silent = false) => {
    const validationMessage = getImageModelValidationMessage(selectedImageModel);
    if (validationMessage) {
      new Notice(validationMessage, 8000);
      await errorMessage(spinnerID, validationMessage);
      return;
    }

    const imageSelection = getResolvedImageModelSelection(selectedImageModel);
    const result = await ea.generateAIImage({
      ...imageSelection.requestConfig,
      text,
      imageGenerationProperties: {
        size: imageSize,
        //quality: "standard", //not supported by dall-e-2
        n: 1,
      },
    });

    if (!isViewAlive()) return;
    const imageSource = getGeneratedImageSource(result);

    if (!imageSource) {
      await errorMessage(spinnerID, getImageRequestErrorMessage(result, imageSelection.modelId));
      return;
    }

    const spinner = ea.getElement(spinnerID);
    spinner.isDeleted = true;
    const imageID = await ea.addImage(spinner.x, spinner.y, imageSource);
    if (!isViewAlive()) return;
    const imageEl = ea.getElement(imageID);
    const revisedPrompt = result.revisedPrompt;
    if (revisedPrompt && !silent) {
      ea.style.fontSize = 16;
      const rectID = ea.addText(imageEl.x + 15, imageEl.y + imageEl.height + 50, revisedPrompt, {
        width: imageEl.width - 30,
        textAlign: "center",
        textVerticalAlign: "top",
        box: true,
      });
      ea.getElement(rectID).strokeColor = "transparent";
      ea.getElement(rectID).backgroundColor = "transparent";
      ea.addToGroup(
        ea
          .getElements()
          .filter((el) => el.id !== spinnerID)
          .map((el) => el.id),
      );
    }

    await ea.addElementsToView(false, true, true);
    if (silent) return;
  };

  const run = async (text) => {
    await pendingPreview;
    if (!isViewAlive()) return;
    const taskConfig = getActiveTaskConfig();
    const taskConfigValidationMessage = getTaskConfigValidationMessage(taskConfig);
    if (taskConfigValidationMessage) {
      new Notice(taskConfigValidationMessage, 8000);
      return;
    }

    const trimmedText = String(text ?? "").trim();
    const allowsTextInput = doesTaskAllowUserPrompt(taskConfig.id);
    const allowsImageInput = doesTaskAllowImageInput(taskConfig.id);
    const hasAllowedText = allowsTextInput && Boolean(trimmedText);
    const hasAllowedImage = allowsImageInput && Boolean(imageDataURL);

    if (!hasAllowedText && !hasAllowedImage) {
      const emptyInputMessage =
        allowsImageInput && !allowsTextInput
          ? t("selectContentBeforeRunningExcaliai")
          : allowsTextInput && !allowsImageInput
            ? t("enterAPromptBeforeRunningExcaliai")
            : t("enterAPromptOrSelectContentBefore");
      new Notice(emptyInputMessage);
      return;
    }

    const outputType = getTaskOutputType(taskConfig);
    const isImageGenRequest =
      taskUsesDirectImageModel(taskConfig.id) || taskUsesImagePromptPipeline(taskConfig.id);
    const isImageEditRequest = isImageEditTask(taskConfig.id);
    const isMaskEditRequest = isImageEditRequest && shouldUseMaskEdit();
    const usesTextModel = doesTaskUseTextModel(taskConfig.id);
    const sendsCanvasImage = allowsImageInput && Boolean(imageDataURL);
    const requiresMultimodalText = usesTextModel && sendsCanvasImage;
    const activeTextSelection = getResolvedTextModelSelection(selectedTextModel);
    const activeImageSelection = getResolvedImageModelSelection(selectedImageModel);
    const validationMessage = getTaskValidationMessage({
      usesTextModel,
      requiresMultimodalText,
      isImageGenRequest,
      isImageEditRequest,
      requiresPromptTransformSupport: isImageEditRequest && !isMaskEditRequest,
      requiresMaskEditSupport: isMaskEditRequest,
      activeTextSelection,
      activeImageSelection,
    });

    if (validationMessage) {
      new Notice(validationMessage, 8000);
      return;
    }

    if (taskRequiresUserPrompt(taskConfig.id) && !trimmedText) {
      new Notice(
        isImageEditRequest
          ? t("enterInstructionsForHowTheImageShould")
          : t("enterAPromptBeforeRunningExcaliai"),
      );
      return;
    }

    if (taskRequiresImageInput(taskConfig.id) && !imageDataURL) {
      new Notice(
        isImageEditRequest ? t("selectAnImage") : t("selectCanvasContentBeforeRunningThisTask"),
      );
      return;
    }

    if (isMaskEditRequest && !maskDataURL) {
      new Notice(t("selectOrCreateAMask"));
      return;
    }

    //place spinner next to selected elements
    const bb = ea.getBoundingBox(ea.getViewSelectedElements());
    const spinnerID = ea.addEmbeddable(
      bb.topX + bb.width + 100,
      bb.topY - (720 - bb.height) / 2,
      550,
      720,
      spinner,
    );

    await ea.addElementsToView(false, true);
    if (!isViewAlive()) return;
    ea.clear();
    const embeddable = ea.getViewElements().filter((el) => el.id === spinnerID);
    ea.copyViewElementsToEAforEditing(embeddable);
    ea.viewZoomToElements(false, ea.getViewSelectedElements().concat(embeddable));

    if (taskUsesDirectImageModel(taskConfig.id)) {
      await generateImage(
        trimmedText,
        spinnerID,
        bb,
        outputType.blocktype === TASK_RESULT_TYPES.IMAGE_SILENT,
      );
      return;
    }

    let result;
    let requestTextResult = null;
    if (isImageEditRequest) {
      result = isMaskEditRequest
        ? await ea.maskEditAIImage({
            ...activeImageSelection.requestConfig,
            image: { url: imageDataURL },
            ...(trimmedText ? { text: trimmedText } : {}),
            imageGenerationProperties: {
              size: imageSize,
              n: 1,
              mask: maskDataURL,
            },
          })
        : await ea.transformAIImage({
            ...activeImageSelection.requestConfig,
            image: { url: imageDataURL },
            ...(trimmedText ? { text: trimmedText } : {}),
            imageGenerationProperties: {
              size: imageSize,
              n: 1,
            },
          });
    } else {
      requestTextResult = async () => {
        const maxTokens = getConfiguredTextMaxTokens();
        const textRequestObject = {
          ...activeTextSelection.requestConfig,
          ...(sendsCanvasImage ? { image: { url: imageDataURL } } : {}),
          ...(trimmedText ? { text: trimmedText } : {}),
          ...(taskConfig.systemPrompt ? { systemPrompt: taskConfig.systemPrompt } : {}),
          ...(outputType.instruction ? { instruction: outputType.instruction } : {}),
          ...(maxTokens ? { maxTokens } : {}),
        };

        return sendsCanvasImage
          ? await ea.analyzeAIImage(textRequestObject)
          : await ea.generateAIText(textRequestObject);
      };

      result = await requestTextResult();
    }

    if (!isViewAlive()) return;

    if (isImageEditRequest) {
      if (!isViewAlive()) return;
      const imageSource = getGeneratedImageSource(result);
      if (!imageSource) {
        await errorMessage(
          spinnerID,
          getImageRequestErrorMessage(result, activeImageSelection.modelId),
        );
        return;
      }

      const spinner = ea.getElement(spinnerID);
      spinner.isDeleted = true;
      const imageID = await ea.addImage(spinner.x, spinner.y, imageSource);
      if (!isViewAlive()) return;
      await ea.addElementsToView(false, true, true);
      return;
    }

    if (result?.json?.error) {
      await errorMessage(spinnerID, result?.json?.error?.message);
      return;
    }

    //exctract codeblock and display result
    let content = extractStructuredContent(result.content, outputType.blocktype);

    if (!content) {
      const errorDetails =
        outputType.blocktype === TASK_RESULT_TYPES.HTML &&
        isMaxTokenFinishReason(getResultFinishReason(result))
          ? t("theModelHitTheTokenLimitBefore")
          : undefined;
      await errorMessage(spinnerID, errorDetails);
      return;
    }

    if (taskUsesImagePromptPipeline(taskConfig.id)) {
      await generateImage(
        content,
        spinnerID,
        bb,
        outputType.blocktype === TASK_RESULT_TYPES.IMAGE_SILENT,
      );
      return;
    }

    switch (outputType.blocktype) {
      case "html": {
        const link = await ea.convertStringToDataURL(content);
        if (!isViewAlive()) return;
        ea.getElement(spinnerID).link = link;
        await ea.addElementsToView(false, true);
        break;
      }
      case "mindmap": {
        const mmb = window?.MindMapBuilderAPI;
        if (!mmb?.setView || !mmb?.importMarkdown) {
          await errorMessage(spinnerID, t("mindmapBuilderIsNotAvailable"));
          return;
        }

        const setViewResult = mmb.setView(ea.targetView);
        if (!setViewResult?.ok) {
          await errorMessage(
            spinnerID,
            setViewResult?.error?.message || t("couldNotConnectToMindmapBuilder"),
          );
          return;
        }

        const importResult = await mmb.importMarkdown({ markdown: content });
        if (!importResult?.ok) {
          await errorMessage(
            spinnerID,
            importResult?.error?.message || t("couldNotCreateTheMindMap"),
          );
          return;
        }

        ea.getElement(spinnerID).isDeleted = true;
        await ea.addElementsToView(false, true, true);
        new Notice(t("mindMapCreatedInMindmapBuilder"), 8000);
        break;
      }
      case "svg":
        ea.getElement(spinnerID).isDeleted = true;
        await ea.importSVG(content);
        if (!isViewAlive()) return;
        ea.addToGroup(ea.getElements().map((el) => el.id));
        if (ea.getViewSelectedElements().length > 0) {
          ea.targetView.currentPosition = { x: bb.topX + bb.width + 100, y: bb.topY };
        }
        await ea.addElementsToView(true, false);
        break;
      case "mermaid":
        if (content.startsWith("mermaid")) {
          content = content.replace(/^mermaid/, "").trim();
        }

        try {
          result = await ea.addMermaid(content);
          if (typeof result === "string") {
            await errorMessage(spinnerID, t("openMoreToolsMermaidToExcalidrawTo") + result);
            return;
          }
        } catch (e) {
          if (!isViewAlive()) return;
          ea.addText(0, 0, content);
        }
        if (!isViewAlive()) return;
        ea.getElement(spinnerID).isDeleted = true;
        ea.targetView.currentPosition = { x: bb.topX + bb.width + 100, y: bb.topY - bb.height };
        await ea.addElementsToView(true, false);
        setMermaidDataToStorage(content);
        new Notice(t("openMoreToolsMermaidToExcalidrawTo2"), 8000);
        break;
    }
  };

  // --------------------------------------
  // User Interface
  // --------------------------------------
  let previewDiv;

  const createUniqueTaskId = (candidateValue, taskConfigs, currentTaskId = "") => {
    const existingTaskIds = new Set(
      taskConfigs
        .filter((taskConfig) => taskConfig.id !== currentTaskId)
        .map((taskConfig) => taskConfig.id),
    );
    const baseId = createTaskIdFromName(candidateValue) || `task-${taskConfigs.length + 1}`;
    let nextId = baseId;
    let duplicateCount = 2;
    while (existingTaskIds.has(nextId)) {
      nextId = `${baseId}-${duplicateCount++}`;
    }
    return nextId;
  };

  const createBlankTaskConfig = (taskConfigs = []) => {
    const name = t("newTask", { value1: taskConfigs.length + 1 });
    return normalizeTaskConfig(
      {
        id: createUniqueTaskId(name, taskConfigs),
        name,
        help: t("describeWhatThisTaskDoes"),
        systemPrompt: "",
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
      taskConfigs.length,
    );
  };

  const syncStateToSettings = () => {
    settings.config.tasks = normalizeTaskConfigs(settings.config?.tasks, {
      fallbackToDefaults: false,
    });
    const nextSelectedTaskId =
      getVisibleTaskConfigById(selectedTaskId)?.id ?? getVisibleTaskConfigs()[0]?.id ?? "";
    settings.state = normalizeState(
      {
        selectedTaskId: nextSelectedTaskId,
        userPrompt,
        maskEdit: prefersMaskEdit,
        textModel: selectedTextModel,
        imageModel: selectedImageModel,
        maxTokens: selectedMaxTokens,
        imageSize,
      },
      settings.config.tasks,
    );

    userPrompt = settings.state.userPrompt;
    selectedTaskId = settings.state.selectedTaskId;
    prefersMaskEdit = settings.state.maskEdit;
    selectedTextModel = settings.state.textModel;
    selectedImageModel = settings.state.imageModel;
    selectedMaxTokens = settings.state.maxTokens;
    imageSize = settings.state.imageSize;
  };

  const saveExcaliAISettings = async () => {
    syncStateToSettings();
    await ea.setScriptSettings(settings);
    dirty = false;
  };

  const addPreviewImage = () => {
    if (!previewDiv) return;
    const activeTask = getActiveTaskConfig();
    previewDiv.empty();

    if (!imageDataURL) {
      return;
    }

    previewDiv.createEl("img", {
      cls: "excali-ai-preview-img",
      attr: { src: imageDataURL },
    });

    if (activeTask && !doesTaskAllowImageInput(activeTask.id)) {
      previewDiv.createEl("p", {
        text: t("thisTaskIgnoresTheCurrentCanvasSelection"),
        cls: "excali-ai-help-text",
      });
      return;
    }

    if (isImageEditTask() && !shouldUseMaskEdit()) {
      previewDiv.createEl("p", {
        text: activeImageModelSupportsMaskEdits()
          ? t("maskEditIsOffNonImageElements")
          : t("thisModelDoesnTSupportMaskEdits"),
        cls: "excali-ai-help-text",
      });
      return;
    }

    if (maskDataURL) {
      previewDiv.createEl("img", {
        cls: "excali-ai-preview-img",
        attr: { src: maskDataURL },
      });
    }
  };

  const openTaskEditorModal = ({ reopenMainModal = false } = {}) => {
    const taskModal = new ea.obsidian.Modal(app);
    const unregisterTaskModalCleanup = ea.registerCleanup(() => taskModal.close());
    taskModal.modalEl.style.width = "100%";
    taskModal.modalEl.style.maxWidth = "1100px";
    taskModal.modalEl.classList.add("excali-ai-task-editor-modal");

    let editorDirty = false;
    let refreshingEditorFields = false;
    let editableTasks = normalizeTaskConfigs(cloneJSON(getTaskConfigs()), {
      fallbackToDefaults: false,
    });
    let editorTaskId =
      editableTasks.find((taskConfig) => taskConfig.id === selectedTaskId)?.id ??
      editableTasks[0]?.id ??
      "";
    let taskSelectDropdown;
    let taskIdText;
    let taskNameText;
    let helpTextArea;
    let systemPromptTextArea;
    let outputInstructionTextArea;
    let executionModeDropdown;
    let resultTypeDropdown;
    let userPromptDropdown;
    let imageInputDropdown;
    let maskModeDropdown;
    let validationEl;
    let taskHeaderSetting;
    let taskIdSetting;
    let taskNameSetting;
    let helpSetting;
    let systemPromptSetting;
    let outputInstructionSetting;
    let executionModeSetting;
    let resultTypeSetting;
    let userPromptSetting;
    let imageInputSetting;
    let maskModeSetting;

    const addTaskEditorFieldClass = (setting, className = "excali-ai-task-editor-field") => {
      if (setting?.settingEl) {
        setting.settingEl.classList.add(className);
      }
    };

    const getEditorTask = () =>
      editableTasks.find((taskConfig) => taskConfig.id === editorTaskId) ?? null;

    const ensureEditorTaskId = () => {
      if (editableTasks.some((taskConfig) => taskConfig.id === editorTaskId)) {
        return editorTaskId;
      }
      editorTaskId = editableTasks[0]?.id ?? "";
      return editorTaskId;
    };

    const refreshTaskEditorDropdown = () => {
      if (!taskSelectDropdown) return;
      ensureEditorTaskId();
      while (taskSelectDropdown.selectEl.options.length > 0) {
        taskSelectDropdown.selectEl.remove(0);
      }
      editableTasks.forEach((taskConfig) =>
        taskSelectDropdown.addOption(taskConfig.id, taskConfig.name),
      );
      taskSelectDropdown.setDisabled(editableTasks.length === 0);
      if (editableTasks.length > 0) {
        taskSelectDropdown.setValue(editorTaskId);
      }
    };

    const updateTaskEditorVisibility = () => {
      const taskConfig = getEditorTask();
      const hasTask = Boolean(taskConfig);
      [
        taskIdSetting,
        taskNameSetting,
        helpSetting,
        systemPromptSetting,
        outputInstructionSetting,
        executionModeSetting,
        resultTypeSetting,
        userPromptSetting,
        imageInputSetting,
        maskModeSetting,
      ].forEach((setting) => {
        if (setting) {
          setting.settingEl.style.display = hasTask ? "" : "none";
        }
      });

      updateExecutionModeDescription();
      updateResultTypeDescription();

      if (!taskConfig) {
        return;
      }

      const mode = taskConfig.execution.mode;
      const usesTextPipeline =
        mode === TASK_EXECUTION_MODES.TEXT_RESULT || mode === TASK_EXECUTION_MODES.IMAGE_PROMPT;
      const showsOutputInstruction =
        mode === TASK_EXECUTION_MODES.TEXT_RESULT || mode === TASK_EXECUTION_MODES.IMAGE_PROMPT;
      if (systemPromptSetting) {
        systemPromptSetting.settingEl.style.display = usesTextPipeline ? "" : "none";
      }
      if (outputInstructionSetting) {
        outputInstructionSetting.settingEl.style.display = showsOutputInstruction ? "" : "none";
      }
      if (maskModeSetting) {
        maskModeSetting.settingEl.style.display =
          mode === TASK_EXECUTION_MODES.IMAGE_EDIT ? "" : "none";
      }
    };

    const updateExecutionModeDescription = () => {
      if (!executionModeSetting) return;
      const taskConfig = getEditorTask();
      if (!taskConfig) {
        executionModeSetting.descEl.setText(t("determinesHowTheTaskRuns"));
        return;
      }
      executionModeSetting.descEl.innerHTML = `Determines how the task runs.<br><span class="excali-ai-task-editor-note">${getTaskExecutionModeDescription(taskConfig.execution.mode)}</span>`;
    };

    const updateResultTypeDescription = () => {
      if (!resultTypeSetting) return;
      const taskConfig = getEditorTask();
      if (!taskConfig) {
        resultTypeSetting.descEl.setText(t("controlsHowExcaliaiInterpretsTheModelResponse"));
        return;
      }
      const runtimeRequirement = getTaskRuntimeRequirement(taskConfig);
      const runtimeText =
        runtimeRequirement !== TASK_RUNTIME_APIS.NONE
          ? `<br><span class="excali-ai-task-editor-accent">Requires: ${getTaskRuntimeRequirementLabel(runtimeRequirement)}</span>`
          : "";
      resultTypeSetting.descEl.innerHTML = `Controls how ExcaliAI interprets the model response.<br><span class="excali-ai-task-editor-note">${getTaskResultTypeDescription(taskConfig.execution.resultType)}</span>${runtimeText}`;
    };

    const updateTaskEditorValidation = () => {
      if (!validationEl) return;
      const taskConfig = getEditorTask();
      const validationMessage = getTaskConfigValidationMessage(taskConfig);
      if (!taskConfig) {
        validationEl.innerHTML = t("validationNoTasksConfiguredAddATask");
        validationEl.style.color = "var(--text-warning)";
        return;
      }
      if (validationMessage) {
        validationEl.innerHTML = t("validation", { value1: validationMessage });
        validationEl.style.color = "var(--text-error)";
        return;
      }
      validationEl.innerHTML = t("validationTaskConfigurationIsValid");
      validationEl.style.color = "var(--text-muted)";
    };

    const populateTaskEditorFields = () => {
      const taskConfig = getEditorTask();
      refreshingEditorFields = true;
      if (taskIdText) taskIdText.setValue(taskConfig?.id ?? "");
      if (taskNameText) taskNameText.setValue(taskConfig?.name ?? "");
      if (helpTextArea) helpTextArea.setValue(taskConfig?.help ?? "");
      if (systemPromptTextArea) systemPromptTextArea.setValue(taskConfig?.systemPrompt ?? "");
      if (outputInstructionTextArea)
        outputInstructionTextArea.setValue(taskConfig?.outputInstruction ?? "");
      if (executionModeDropdown)
        executionModeDropdown.setValue(
          taskConfig?.execution?.mode ?? TASK_EXECUTION_MODES.TEXT_RESULT,
        );
      if (resultTypeDropdown)
        resultTypeDropdown.setValue(taskConfig?.execution?.resultType ?? TASK_RESULT_TYPES.HTML);
      if (userPromptDropdown)
        userPromptDropdown.setValue(taskConfig?.execution?.userPrompt ?? TASK_INPUT_RULES.OPTIONAL);
      if (imageInputDropdown)
        imageInputDropdown.setValue(taskConfig?.execution?.imageInput ?? TASK_INPUT_RULES.OPTIONAL);
      if (maskModeDropdown)
        maskModeDropdown.setValue(taskConfig?.execution?.maskMode ?? TASK_MASK_MODES.DISABLED);
      refreshingEditorFields = false;
      refreshTaskEditorDropdown();
      updateTaskEditorVisibility();
      updateTaskEditorValidation();
    };

    taskModal.onOpen = () => {
      const contentEl = taskModal.contentEl;
      contentEl.createEl("style", {
        text: `
        .excali-ai-task-editor-modal {
          width: min(1100px, calc(100vw - 1rem)) !important;
          max-width: min(1100px, calc(100vw - 1rem)) !important;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field {
          display: block;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field .setting-item-info {
          max-width: none;
          padding-right: 0;
          margin-bottom: 0.45rem;
        }
        .excali-ai-task-editor-header .setting-item-control {
          width: fit-content !important;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field .setting-item-control {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: stretch;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field .setting-item-control > :not(button) {
          flex: 1 1 100%;
          min-width: 0;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field .setting-item-control button {
          flex: 0 0 auto;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field input[type="text"],
        .excali-ai-task-editor-modal .excali-ai-task-editor-field input[type="number"],
        .excali-ai-task-editor-modal .excali-ai-task-editor-field select,
        .excali-ai-task-editor-modal .excali-ai-task-editor-field textarea {
          width: 100%;
          max-width: none;
          box-sizing: border-box;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-field textarea {
          resize: vertical;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-header .setting-item-info {
          max-width: none;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-header .setting-item-control {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-note {
          color: var(--text-muted);
        }
        .excali-ai-task-editor-modal .excali-ai-task-editor-accent {
          color: var(--text-accent);
          font-weight: 600;
        }
        @media (max-width: 700px) {
          .excali-ai-task-editor-modal .excali-ai-task-editor-header .setting-item-control > * {
            flex: 1 1 100%;
          }
        }
      `,
      });

      const headerContainer = contentEl.createDiv({
        style:
          "display: flex; align-items: center; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px;",
      });
      headerContainer.innerHTML = t("excaliaiTaskEditor", {
        value1: ea.obsidian.getIcon("bot").outerHTML,
      });

      contentEl.createEl("p", { text: t("tasksAreStoredInExcaliaiSScript") });

      taskHeaderSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("task2"))
        .setDesc(t("selectWhichTaskToEdit"))
        .addDropdown((dropdown) => {
          taskSelectDropdown = dropdown;
          dropdown.selectEl.style.flex = t("px");
          dropdown.selectEl.style.minWidth = "220px";
          refreshTaskEditorDropdown();
          dropdown.onChange((value) => {
            if (refreshingEditorFields) return;
            editorTaskId = value;
            populateTaskEditorFields();
          });
        })
        .addButton((button) =>
          button
            .setButtonText(t("addTask"))
            .setIcon("plus")
            .setTooltip(t("addTask"))
            .onClick(() => {
              const nextTask = createBlankTaskConfig(editableTasks);
              nextTask.id = createUniqueTaskId(nextTask.id, editableTasks);
              editableTasks.push(nextTask);
              editorTaskId = nextTask.id;
              editorDirty = true;
              populateTaskEditorFields();
            }),
        )
        .addButton((button) =>
          button
            .setButtonText(t("deleteTask"))
            .setIcon("trash-2")
            .setTooltip(t("deleteTask"))
            .onClick(() => {
              const taskConfig = getEditorTask();
              if (!taskConfig) {
                new Notice(t("noTaskIsSelected"), 5000);
                return;
              }
              if (!window.confirm(t("deleteTheTask", { value1: taskConfig.name }))) {
                return;
              }
              editableTasks = editableTasks.filter((candidate) => candidate.id !== taskConfig.id);
              editorTaskId = editableTasks[0]?.id ?? "";
              editorDirty = true;
              populateTaskEditorFields();
            }),
        )
        .addButton((button) =>
          button
            .setButtonText(t("resetDefaults"))
            .setIcon("rotate-ccw")
            .setTooltip(t("resetDefaults"))
            .onClick(() => {
              if (!window.confirm(t("resetAllExcaliaiTasksToTheShipped"))) {
                return;
              }
              editableTasks = cloneJSON(DEFAULT_TASK_CONFIGS);
              editorTaskId =
                editableTasks.find((taskConfig) => taskConfig.id === DEFAULT_TASK_ID)?.id ??
                editableTasks[0]?.id ??
                "";
              editorDirty = true;
              populateTaskEditorFields();
            }),
        );
      addTaskEditorFieldClass(taskHeaderSetting, "excali-ai-task-editor-header");

      validationEl = contentEl.createEl("p");

      taskIdSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("taskId"))
        .setDesc(t("settingsKeyNormalizedToLowercaseWithDashes"))
        .addText((text) => {
          taskIdText = text;
          text.inputEl.style.width = "100%";
          text.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            const nextId = createUniqueTaskId(
              value || taskConfig.name,
              editableTasks,
              taskConfig.id,
            );
            taskConfig.id = nextId;
            editorTaskId = nextId;
            editorDirty = true;
            populateTaskEditorFields();
          });
        });
      addTaskEditorFieldClass(taskIdSetting);

      taskNameSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("taskName"))
        .setDesc(t("shownInTheExcaliaiTaskPicker"))
        .addText((text) => {
          taskNameText = text;
          text.inputEl.style.width = "100%";
          text.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.name = value;
            editorDirty = true;
            refreshTaskEditorDropdown();
            updateTaskEditorValidation();
          });
        });
      addTaskEditorFieldClass(taskNameSetting);

      helpSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("taskHelp"))
        .setDesc(t("explainsTheTaskInTheMainExcaliai"))
        .addTextArea((text) => {
          helpTextArea = text;
          text.inputEl.style.minHeight = "6em";
          text.inputEl.style.width = "100%";
          text.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.help = value;
            editorDirty = true;
          });
        });
      addTaskEditorFieldClass(helpSetting);

      systemPromptSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("systemPrompt"))
        .setDesc(t("sentToTheTextModelWhenThe"))
        .addTextArea((text) => {
          systemPromptTextArea = text;
          text.inputEl.style.minHeight = "10em";
          text.inputEl.style.width = "100%";
          text.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.systemPrompt = value;
            editorDirty = true;
          });
        });
      addTaskEditorFieldClass(systemPromptSetting);

      outputInstructionSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("outputInstruction"))
        .setDesc(t("controlsTheExpectedResponseFormatWhenThe"))
        .addTextArea((text) => {
          outputInstructionTextArea = text;
          text.inputEl.style.minHeight = "6em";
          text.inputEl.style.width = "100%";
          text.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.outputInstruction = value;
            editorDirty = true;
          });
        });
      addTaskEditorFieldClass(outputInstructionSetting);

      executionModeSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("executionMode"))
        .setDesc(t("determinesHowTheTaskRuns"))
        .addDropdown((dropdown) => {
          executionModeDropdown = dropdown;
          dropdown.addOption(
            TASK_EXECUTION_MODES.TEXT_RESULT,
            getTaskExecutionModeLabel(TASK_EXECUTION_MODES.TEXT_RESULT),
          );
          dropdown.addOption(
            TASK_EXECUTION_MODES.IMAGE_PROMPT,
            getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_PROMPT),
          );
          dropdown.addOption(
            TASK_EXECUTION_MODES.IMAGE_DIRECT,
            getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_DIRECT),
          );
          dropdown.addOption(
            TASK_EXECUTION_MODES.IMAGE_EDIT,
            getTaskExecutionModeLabel(TASK_EXECUTION_MODES.IMAGE_EDIT),
          );
          dropdown.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.execution.mode = value;
            if (
              value === TASK_EXECUTION_MODES.TEXT_RESULT &&
              (taskConfig.execution.resultType === TASK_RESULT_TYPES.IMAGE ||
                taskConfig.execution.resultType === TASK_RESULT_TYPES.IMAGE_SILENT)
            ) {
              taskConfig.execution.resultType = TASK_RESULT_TYPES.HTML;
            }
            if (
              (value === TASK_EXECUTION_MODES.IMAGE_PROMPT ||
                value === TASK_EXECUTION_MODES.IMAGE_DIRECT) &&
              !(
                taskConfig.execution.resultType === TASK_RESULT_TYPES.IMAGE ||
                taskConfig.execution.resultType === TASK_RESULT_TYPES.IMAGE_SILENT
              )
            ) {
              taskConfig.execution.resultType = TASK_RESULT_TYPES.IMAGE;
            }
            if (value === TASK_EXECUTION_MODES.IMAGE_DIRECT) {
              taskConfig.execution.imageInput = TASK_INPUT_RULES.DISABLED;
              taskConfig.execution.maskMode = TASK_MASK_MODES.DISABLED;
            }
            if (value === TASK_EXECUTION_MODES.IMAGE_EDIT) {
              taskConfig.execution.resultType = TASK_RESULT_TYPES.IMAGE;
              taskConfig.execution.imageInput = TASK_INPUT_RULES.REQUIRED;
              if (taskConfig.execution.maskMode === TASK_MASK_MODES.DISABLED) {
                taskConfig.execution.maskMode = TASK_MASK_MODES.OPTIONAL;
              }
            }
            if (value !== TASK_EXECUTION_MODES.IMAGE_EDIT) {
              taskConfig.execution.maskMode = TASK_MASK_MODES.DISABLED;
            }
            editorDirty = true;
            populateTaskEditorFields();
          });
        });
      addTaskEditorFieldClass(executionModeSetting);

      resultTypeSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("resultType"))
        .setDesc(t("controlsHowExcaliaiInterpretsTheModelResponse"))
        .addDropdown((dropdown) => {
          resultTypeDropdown = dropdown;
          dropdown.addOption(
            TASK_RESULT_TYPES.HTML,
            getTaskResultTypeLabel(TASK_RESULT_TYPES.HTML),
          );
          dropdown.addOption(
            TASK_RESULT_TYPES.MINDMAP,
            getTaskResultTypeLabel(TASK_RESULT_TYPES.MINDMAP),
          );
          dropdown.addOption(
            TASK_RESULT_TYPES.MERMAID,
            getTaskResultTypeLabel(TASK_RESULT_TYPES.MERMAID),
          );
          dropdown.addOption(TASK_RESULT_TYPES.SVG, getTaskResultTypeLabel(TASK_RESULT_TYPES.SVG));
          dropdown.addOption(
            TASK_RESULT_TYPES.IMAGE,
            getTaskResultTypeLabel(TASK_RESULT_TYPES.IMAGE),
          );
          dropdown.addOption(
            TASK_RESULT_TYPES.IMAGE_SILENT,
            getTaskResultTypeLabel(TASK_RESULT_TYPES.IMAGE_SILENT),
          );
          dropdown.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.execution.resultType = value;
            taskConfig.execution.requiresApi =
              getTaskResultTypeMeta(value).runtimeRequirement ?? TASK_RUNTIME_APIS.NONE;
            editorDirty = true;
            updateResultTypeDescription();
            updateTaskEditorValidation();
          });
        });
      addTaskEditorFieldClass(resultTypeSetting);

      userPromptSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("userPrompt"))
        .setDesc(t("controlsWhetherTheMainPromptBoxIs"))
        .addDropdown((dropdown) => {
          userPromptDropdown = dropdown;
          dropdown.addOption(TASK_INPUT_RULES.OPTIONAL, t("optional"));
          dropdown.addOption(TASK_INPUT_RULES.REQUIRED, t("required"));
          dropdown.addOption(TASK_INPUT_RULES.DISABLED, t("disabled"));
          dropdown.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.execution.userPrompt = value;
            editorDirty = true;
          });
        });
      addTaskEditorFieldClass(userPromptSetting);

      imageInputSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("canvasImageInput"))
        .setDesc(t("controlsWhetherTheSelectedCanvasContentIs"))
        .addDropdown((dropdown) => {
          imageInputDropdown = dropdown;
          dropdown.addOption(TASK_INPUT_RULES.OPTIONAL, t("optional"));
          dropdown.addOption(TASK_INPUT_RULES.REQUIRED, t("required"));
          dropdown.addOption(TASK_INPUT_RULES.DISABLED, t("disabled"));
          dropdown.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.execution.imageInput = value;
            editorDirty = true;
            updateTaskEditorValidation();
          });
        });
      addTaskEditorFieldClass(imageInputSetting);

      maskModeSetting = new ea.obsidian.Setting(contentEl)
        .setName(t("maskMode"))
        .setDesc(t("availableOnlyInEditSelectedImageMode"))
        .addDropdown((dropdown) => {
          maskModeDropdown = dropdown;
          dropdown.addOption(TASK_MASK_MODES.DISABLED, t("disabled"));
          dropdown.addOption(TASK_MASK_MODES.OPTIONAL, t("optionalToggle"));
          dropdown.addOption(TASK_MASK_MODES.REQUIRED, t("alwaysRequired"));
          dropdown.onChange((value) => {
            if (refreshingEditorFields) return;
            const taskConfig = getEditorTask();
            if (!taskConfig) return;
            taskConfig.execution.maskMode = value;
            editorDirty = true;
            updateTaskEditorValidation();
          });
        });
      addTaskEditorFieldClass(maskModeSetting);

      new ea.obsidian.Setting(contentEl).addButton((button) =>
        button
          .setButtonText(t("done"))
          .setIcon("check")
          .setTooltip(t("done"))
          .setCta()
          .onClick(() => taskModal.close()),
      );

      populateTaskEditorFields();
    };

    taskModal.onClose = async () => {
      unregisterTaskModalCleanup();
      if (editorDirty) {
        settings.config.tasks = normalizeTaskConfigs(editableTasks, { fallbackToDefaults: false });
        selectedTaskId =
          getVisibleTaskConfigById(editorTaskId)?.id ?? getVisibleTaskConfigs()[0]?.id ?? "";
        await saveExcaliAISettings();
      }
      if (reopenMainModal) {
        openConfigModal();
      }
    };

    taskModal.open();
  };

  const openConfigModal = () => {
    if (!isViewAlive()) return;
    dirty = false;
    const configModal = new ea.FloatingModal(app);
    configModal.modalEl.classList.add("excali-ai-floating-modal");

    let openTaskEditorAfterClose = false;
    let detachSelectionListeners = () => {};
    let unregisterModalCleanup = () => {};
    let refreshingMainFields = false;

    let lastSelectedElementIds = ea
      .getViewSelectedElements()
      .map((e) => e.id)
      .sort()
      .join(",");
    let isUpdatingSelection = false;

    configModal.onOpen = async () => {
      const contentEl = configModal.contentEl;

      // --- CSS ---
      contentEl.createEl("style", {
        text: `
        .excali-ai-floating-modal {
          width: min(1000px, 95vw) !important;
          max-height: 90vh !important;
          border-radius: 8px;
        }
        .excali-ai-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 15px;
          border-bottom: 1px solid var(--background-modifier-border);
          padding-bottom: 10px;
        }
        .excali-ai-header h2 { margin: 0; font-weight: 600; }
        .excali-ai-header svg { width: 28px; height: 28px; color: var(--interactive-accent); }

        .excali-ai-main-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .excali-ai-left-col { flex: 1 1 55%; min-width: 0; display: flex; flex-direction: column; }
        .excali-ai-right-col { flex: 1 1 45%; min-width: 0; background: var(--background-secondary); padding: 15px; border-radius: 8px; border: 1px solid var(--background-modifier-border); }

        @media (min-width: 768px) {
          .excali-ai-main-container { flex-direction: row; }
        }

        .excali-ai-warning {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          background: var(--background-modifier-error);
          color: var(--text-error);
          border-radius: 6px;
          margin-bottom: 15px;
          font-size: 0.9em;
        }

        .excali-ai-preview-img {
          max-width: 100%;
          max-height: 250px;
          object-fit: contain;
          border: 1px solid var(--background-modifier-border);
          border-radius: 4px;
          margin-top: 10px;
          background: var(--background-primary);
        }

        .excali-ai-help-text {
          font-size: 0.9em;
          color: var(--text-muted);
          margin-top: 5px;
          margin-bottom: 15px;
        }

        .excali-ai-validation-text {
          font-size: 0.9em;
          color: var(--text-error);
          margin-top: 5px;
          margin-bottom: 15px;
          font-weight: 500;
        }

        .excali-ai-advanced-details {
          margin-top: 20px;
          border-top: 1px solid var(--background-modifier-border);
          padding-top: 15px;
        }

        .excali-ai-advanced-summary {
          cursor: pointer;
          color: var(--text-muted);
          font-size: 0.95em;
          font-weight: 500;
          user-select: none;
          display: flex;
          align-items: center;
          gap: 5px;
          margin-bottom: 10px;
        }
        .excali-ai-advanced-summary:hover { color: var(--text-normal); }

        .excali-ai-advanced-content {
          border-left: 2px solid var(--interactive-accent);
          padding-left: 15px;
          margin-bottom: 15px;
          margin-top: 10px;
        }

        .excali-ai-run-container {
          margin-top: auto;
          padding-top: 20px;
          display: flex;
          justify-content: flex-end;
        }

        .excali-ai-task-setting {
          flex-wrap: wrap;
          gap: 10px;
        }
        .excali-ai-task-setting .setting-item-info {
          min-width: 150px;
          flex: 1 1 auto;
        }
        .excali-ai-task-setting .setting-item-control {
          flex: 1 1 auto;
          justify-content: flex-start;
        }

        .excali-ai-advanced-summary > svg {
          transition: transform 0.15s ease-in-out;
          width: 16px;
          height: 16px;
        }
        .excali-ai-advanced-details[open] > .excali-ai-advanced-summary > svg {
          transform: rotate(90deg);
        }
        .excali-ai-advanced-summary::-webkit-details-marker,
        .excali-ai-advanced-summary::marker {
          display: none; /* Hide native marker */
        }
      `,
      });

      const headerContainer = contentEl.createDiv({ cls: "excali-ai-header" });
      headerContainer.innerHTML = t("excaliai", { value1: ea.obsidian.getIcon("bot").outerHTML });

      const mainContainer = contentEl.createDiv({ cls: "excali-ai-main-container" });
      const leftCol = mainContainer.createDiv({ cls: "excali-ai-left-col" });
      const rightCol = mainContainer.createDiv({ cls: "excali-ai-right-col" });

      // --- WARNINGS ---
      const mmbWarning = leftCol.createDiv({ cls: "excali-ai-warning" });
      mmbWarning.innerHTML = t("mindmapBuilderApiIsNotActiveThe", {
        value1: ea.obsidian.getIcon("alert-triangle").outerHTML,
      });
      mmbWarning.style.display = "none";

      let taskDropdown;
      let promptHeadingEl;
      let promptSetting;
      let systemPromptTextArea;
      let systemPromptDiv;
      let textModelSetting;
      let textModelSettingDropdown;
      let imageModelSetting;
      let imageModelSettingDropdown;
      let imageSizeSetting;
      let imageSizeSettingDropdown;
      let maskEditSetting;
      let maskEditToggleComponent;
      let maxTokensSetting;
      let helpEl;
      let taskValidationEl;
      let textModelHelpEl;
      let imageModelHelpEl;
      let maxTokensHelpEl;
      let previewContainerEl = rightCol;

      const checkAndUpdateSelection = async () => {
        if (isUpdatingSelection) return;
        const currentSelectedElementIds = ea
          .getViewSelectedElements()
          .map((e) => e.id)
          .sort()
          .join(",");
        if (lastSelectedElementIds !== currentSelectedElementIds) {
          isUpdatingSelection = true;
          lastSelectedElementIds = currentSelectedElementIds;
          const taskConfig = getActiveTaskConfig();
          if (
            taskConfig &&
            (isImageEditTask(taskConfig.id) || doesTaskAllowImageInput(taskConfig.id))
          ) {
            ({ imageDataURL, maskDataURL } = await generateCanvasDataURL(
              ea.targetView,
              shouldGenerateMaskPreview(),
            ));
            updatePreviewSection();
          }
          isUpdatingSelection = false;
        }
      };

      configModal.modalEl.addEventListener("pointerenter", checkAndUpdateSelection);
      configModal.modalEl.addEventListener("focusin", checkAndUpdateSelection);
      detachSelectionListeners = () => {
        configModal.modalEl.removeEventListener("pointerenter", checkAndUpdateSelection);
        configModal.modalEl.removeEventListener("focusin", checkAndUpdateSelection);
      };

      const refreshTaskDropdown = () => {
        if (!taskDropdown) return;
        const visibleTasks = getVisibleTaskConfigs();
        while (taskDropdown.selectEl.options.length > 0) {
          taskDropdown.selectEl.remove(0);
        }
        visibleTasks.forEach((taskConfig) =>
          taskDropdown.addOption(taskConfig.id, taskConfig.name),
        );
        taskDropdown.setDisabled(visibleTasks.length === 0);
        if (visibleTasks.length > 0) {
          taskDropdown.setValue(selectedTaskId);
        }
      };

      const updateTextModelHelp = () => {
        if (!textModelHelpEl) return;
        const taskConfig = getActiveTaskConfig();
        if (!taskConfig) {
          textModelHelpEl.innerHTML = t("textModelNoRunnableTaskIsSelected");
          return;
        }
        if (!doesTaskUseTextModel(taskConfig.id)) {
          textModelHelpEl.innerHTML = t("textModelThisTaskDoesNotUse");
          return;
        }
        if (!hasAvailableTextModels()) {
          textModelHelpEl.innerHTML = t("textModel", {
            value1: getMissingModelConfigurationMessage("text"),
          });
          return;
        }
        const textSelection = getResolvedTextModelSelection(textModel);
        const multimodalText =
          textSelection.modelConfig?.multimodalSupport === false ? "text-only" : "multimodal";
        const usageText =
          doesTaskAllowImageInput(taskConfig.id) && imageDataURL
            ? t("theSelectedCanvasImageWillAlsoBe")
            : t("onlyTheTextPromptWillBeSent");
        textModelHelpEl.innerHTML = t("textModelProviderThisModelIs", {
          value1: textModel,
          value2: textSelection.providerId || "unknown",
          value3: multimodalText,
          value4: usageText,
        });
        if (textSelection.providerProfile?.provider === "openai")
          textModelHelpEl.appendText(
            " " +
              t("reasoningHelp", {
                effort: textSelection.modelConfig?.reasoningEffort ?? t("reasoningDefault"),
              }),
          );
      };

      const updateImageModelHelp = () => {
        if (!imageModelHelpEl) return;
        const taskConfig = getActiveTaskConfig();
        if (!taskConfig) {
          imageModelHelpEl.innerHTML = t("imageModelNoRunnableTaskIsSelected");
          return;
        }
        if (!isImageGenerationTask(taskConfig.id)) {
          imageModelHelpEl.innerHTML = t("imageModelThisTaskDoesNotUse");
          return;
        }
        if (!hasAvailableImageModels()) {
          imageModelHelpEl.innerHTML = t("imageModel", {
            value1: getMissingModelConfigurationMessage("image"),
          });
          return;
        }
        const configuredSizes = validSizes.length > 0 ? validSizes.join(", ") : DEFAULT_IMAGE_SIZE;
        const modelConfig = getImageModelConfig(imageModel);
        const transformSupportText =
          modelConfig?.supportsPromptImageTransforms === false
            ? t("doesnTSupportPromptTransforms")
            : t("supportsPromptTransforms");
        const maskSupportText =
          modelConfig?.supportsMaskImageEdits === false
            ? t("doesnTSupportMaskEdits")
            : t("supportsMaskEdits");
        const editModeText = isImageEditTask(taskConfig.id)
          ? shouldUseMaskEdit()
            ? t("maskEditIsOnSoNonImage")
            : activeImageModelSupportsMaskEdits()
              ? t("maskEditIsOffSoNonImage")
              : t("thisModelDoesnTSupportMaskEdits2")
          : "";
        imageModelHelpEl.innerHTML = t("imageModelSizesThisModelAndIf", {
          value1: imageModel,
          value2: configuredSizes,
          value3: transformSupportText,
          value4: maskSupportText,
          value5: editModeText,
        });
      };

      const updateMaskEditSetting = () => {
        if (!maskEditSetting || !maskEditToggleComponent) return;
        const taskConfig = getActiveTaskConfig();
        const maskMode = getTaskMaskMode(taskConfig?.id);
        const showMaskSetting =
          Boolean(taskConfig) &&
          isImageEditTask(taskConfig.id) &&
          maskMode !== TASK_MASK_MODES.DISABLED;
        maskEditSetting.settingEl.style.display = showMaskSetting ? "" : "none";
        if (!showMaskSetting) {
          return;
        }

        const maskEditAvailable = activeImageModelSupportsMaskEdits();
        if (maskMode === TASK_MASK_MODES.REQUIRED) {
          maskEditSetting.descEl.setText(
            maskEditAvailable
              ? t("thisTaskAlwaysUsesMaskEdit")
              : t("thisTaskRequiresMaskEditButThe"),
          );
          maskEditToggleComponent.setDisabled(true);
          maskEditToggleComponent.setValue(maskEditAvailable);
          return;
        }

        maskEditSetting.descEl.setText(
          maskEditAvailable
            ? t("onNonImageElementsBecomeTheMask")
            : t("thisModelDoesnTSupportMaskEdits3"),
        );
        maskEditToggleComponent.setDisabled(!maskEditAvailable);
        maskEditToggleComponent.setValue(shouldUseMaskEdit());
      };

      const updateMaxTokensHelp = () => {
        if (!maxTokensHelpEl) return;
        if (!doesTaskUseTextModel()) {
          maxTokensHelpEl.innerHTML = t("textMaxTokensThisTaskDoesNot");
          return;
        }
        const scriptOverride = parsePositiveInteger(selectedMaxTokens);
        const pluginDefault = parsePositiveInteger(aiSettings.defaultMaxResponseTokens);
        const effectiveMaxTokens = getConfiguredTextMaxTokens();
        const sourceText = scriptOverride
          ? t("usingTheExcaliaiOverride")
          : pluginDefault
            ? t("usingThePluginDefaultResponseTokenLimit")
            : t("usingTheSharedAiRuntimeDefaultBehavior");
        maxTokensHelpEl.innerHTML = t("textMaxTokens", {
          value1: effectiveMaxTokens ?? "runtime default",
          value2: sourceText,
        });
      };

      const refreshTextModelDropdown = () => {
        if (!textModelSettingDropdown) return;
        while (textModelSettingDropdown.selectEl.options.length > 0) {
          textModelSettingDropdown.selectEl.remove(0);
        }
        getAvailableTextModels().forEach((model) =>
          textModelSettingDropdown.addOption(model, model),
        );
        textModelSettingDropdown.setDisabled(!hasAvailableTextModels());
        if (hasAvailableTextModels()) {
          textModelSettingDropdown.setValue(textModel);
        }
      };

      const refreshImageSizeDropdown = () => {
        if (!imageSizeSettingDropdown) return;
        while (imageSizeSettingDropdown.selectEl.options.length > 0) {
          imageSizeSettingDropdown.selectEl.remove(0);
        }
        getImageSizeDropdownOptions(validSizes).forEach(({ value, label }) =>
          imageSizeSettingDropdown.addOption(value, label),
        );
        imageSizeSettingDropdown.setDisabled(!hasAvailableImageModels());
        if (hasAvailableImageModels() && validSizes.length > 0) {
          imageSizeSettingDropdown.setValue(imageSize);
        }
      };

      const refreshImageModelDropdown = () => {
        if (!imageModelSettingDropdown) return;
        while (imageModelSettingDropdown.selectEl.options.length > 0) {
          imageModelSettingDropdown.selectEl.remove(0);
        }
        getAvailableImageModels().forEach((model) =>
          imageModelSettingDropdown.addOption(model, model),
        );
        imageModelSettingDropdown.setDisabled(!hasAvailableImageModels());
        if (hasAvailableImageModels()) {
          imageModelSettingDropdown.setValue(imageModel);
        }
      };

      const updatePreviewSection = () => {
        if (!previewContainerEl) return;
        previewContainerEl.empty();
        previewContainerEl.createEl("h3", {
          text: t("preview"),
          attr: { style: "margin-top: 0; margin-bottom: 10px;" },
        });
        previewDiv = null;

        const taskConfig = getActiveTaskConfig();
        if (!taskConfig) {
          previewContainerEl.createEl("p", {
            text: t("noRunnableTaskIsSelected"),
            cls: "excali-ai-help-text",
          });
          return;
        }

        if (imageDataURL) {
          previewDiv = previewContainerEl.createDiv({ attr: { style: "text-align: center;" } });
          addPreviewImage();
          return;
        }

        if (taskRequiresImageInput(taskConfig.id)) {
          previewContainerEl.createEl("span", {
            text: t("selectContentOnTheCanvasThisTask"),
            cls: "excali-ai-help-text",
          });
          return;
        }
        if (doesTaskAllowImageInput(taskConfig.id)) {
          previewContainerEl.createEl("span", {
            text: t("nothingIsSelectedSoOnlyTheText"),
            cls: "excali-ai-help-text",
          });
          return;
        }
        previewContainerEl.createEl("span", {
          text: t("thisTaskUsesOnlyTheTextPrompt"),
          cls: "excali-ai-help-text",
        });
      };

      const updateHelpText = () => {
        const taskConfig = getActiveTaskConfig();
        helpEl.innerHTML = taskConfig
          ? t("howItWorks", { value1: taskConfig.help })
          : t("howItWorksNoRunnableTaskIs");
        const validationMessage = getTaskConfigValidationMessage(taskConfig);
        taskValidationEl.style.display = validationMessage ? "" : "none";
        taskValidationEl.innerHTML = validationMessage
          ? t("taskConfig", { value1: validationMessage })
          : "";
        updateTextModelHelp();
        updateImageModelHelp();
        updateMaxTokensHelp();

        if (mmbWarning) {
          const isMmbTask =
            taskConfig?.execution?.requiresApi === TASK_RUNTIME_APIS.MINDMAP_BUILDER;
          mmbWarning.style.display = isMmbTask && !window?.MindMapBuilderAPI ? "flex" : "none";
        }
      };

      const updateTaskSpecificControls = () => {
        const taskConfig = getActiveTaskConfig();
        const taskId = taskConfig?.id ?? "";
        const usesTextModel = Boolean(taskConfig) && doesTaskUseTextModel(taskId);
        const usesImageModel = Boolean(taskConfig) && isImageGenerationTask(taskId);
        const showsSystemPrompt = usesTextModel && taskConfig.systemPrompt !== null;
        const showsUserPrompt = Boolean(taskConfig) && doesTaskAllowUserPrompt(taskId);

        if (systemPromptDiv) {
          systemPromptDiv.style.display = showsSystemPrompt ? "" : "none";
        }
        if (systemPromptTextArea) {
          refreshingMainFields = true;
          systemPromptTextArea.setValue(taskConfig?.systemPrompt ?? "");
          refreshingMainFields = false;
        }
        if (promptHeadingEl) {
          promptHeadingEl.style.display = showsUserPrompt ? "" : "none";
        }
        if (promptSetting) {
          promptSetting.settingEl.style.display = showsUserPrompt ? "" : "none";
        }
        if (textModelSetting) {
          textModelSetting.settingEl.style.display = usesTextModel ? "" : "none";
        }
        if (maxTokensSetting) {
          maxTokensSetting.settingEl.style.display = usesTextModel ? "" : "none";
        }
        if (imageModelSetting) {
          imageModelSetting.settingEl.style.display = usesImageModel ? "" : "none";
        }
        if (imageSizeSetting) {
          imageSizeSetting.settingEl.style.display = usesImageModel ? "" : "none";
        }
        updateMaskEditSetting();
        updateHelpText();
        updatePreviewSection();
      };

      const taskSetting = new ea.obsidian.Setting(leftCol)
        .setName(t("task2"))
        .setDesc(t("selectTheTaskYouWantToRun"))
        .addDropdown((dropdown) => {
          taskDropdown = dropdown;
          refreshTaskDropdown();
          dropdown.setValue(selectedTaskId);
          dropdown.onChange(async (value) => {
            dirty = true;
            const previousTaskId = selectedTaskId;
            const previousMaskMode = getTaskMaskMode(previousTaskId);
            const previousWasImageEdit = isImageEditTask(previousTaskId);
            selectedTaskId = value;
            const nextWasImageEdit = isImageEditTask(selectedTaskId);
            const nextMaskMode = getTaskMaskMode(selectedTaskId);
            if (previousWasImageEdit !== nextWasImageEdit || previousMaskMode !== nextMaskMode) {
              ({ imageDataURL, maskDataURL } = await generateCanvasDataURL(
                ea.targetView,
                shouldGenerateMaskPreview(),
              ));
            }
            setTextAndImageModels();
            refreshTaskDropdown();
            refreshTextModelDropdown();
            refreshImageModelDropdown();
            refreshImageSizeDropdown();
            updateTaskSpecificControls();
          });
        })
        .addButton((button) =>
          button
            .setButtonText(t("editTasks"))
            .setIcon("settings")
            .setTooltip(t("editTasks"))
            .onClick(() => {
              openTaskEditorAfterClose = true;
              configModal.close();
            }),
        );

      taskSetting.settingEl.classList.add("excali-ai-task-setting");

      helpEl = leftCol.createEl("p", { cls: "excali-ai-help-text" });
      taskValidationEl = leftCol.createEl("p", { cls: "excali-ai-validation-text" });

      promptHeadingEl = leftCol.createEl("h4", {
        text: t("prompt"),
        attr: { style: "margin-bottom: 5px; margin-top: 10px;" },
      });
      promptSetting = new ea.obsidian.Setting(leftCol).addTextArea((text) => {
        text.inputEl.style.minHeight = "8em";
        text.inputEl.style.width = "100%";
        text.setValue(userPrompt);
        text.onChange((value) => {
          userPrompt = value;
          dirty = true;
        });
      });
      promptSetting.nameEl.style.display = "none";
      promptSetting.descEl.style.display = "none";
      promptSetting.infoEl.style.display = "none";
      promptSetting.controlEl.style.width = "100%";

      // ADVANCED SETTINGS
      const advancedDetails = leftCol.createEl("details", { cls: "excali-ai-advanced-details" });
      const advancedSummary = advancedDetails.createEl("summary", {
        cls: "excali-ai-advanced-summary",
      });
      advancedSummary.innerHTML = t("advancedSettings", {
        value1: ea.obsidian.getIcon("chevron-right").outerHTML,
      });
      const advancedContent = advancedDetails.createDiv({ cls: "excali-ai-advanced-content" });

      systemPromptDiv = advancedContent.createDiv();
      systemPromptDiv.createEl("h4", {
        text: t("systemPrompt"),
        attr: { style: "margin-bottom: 5px;" },
      });
      systemPromptDiv.createEl("span", {
        text: t("advancedPromptWarning"),
        cls: "excali-ai-help-text",
      });
      const systemPromptSetting = new ea.obsidian.Setting(systemPromptDiv).addTextArea((text) => {
        systemPromptTextArea = text;
        text.inputEl.style.minHeight = "6em";
        text.inputEl.style.width = "100%";
        text.setValue(getActiveTaskConfig()?.systemPrompt ?? "");
        text.onChange((value) => {
          if (refreshingMainFields) return;
          const taskConfig = getTaskConfigById(selectedTaskId);
          if (!taskConfig) return;
          taskConfig.systemPrompt = value;
          dirty = true;
          updateHelpText();
        });
      });
      systemPromptSetting.nameEl.style.display = "none";
      systemPromptSetting.descEl.style.display = "none";
      systemPromptSetting.infoEl.style.display = "none";

      textModelSetting = new ea.obsidian.Setting(advancedContent)
        .setName(t("textModel2"))
        .addDropdown((dropdown) => {
          textModelSettingDropdown = dropdown;
          refreshTextModelDropdown();
          dropdown.setDisabled(!hasAvailableTextModels());
          dropdown.setValue(textModel || getAvailableTextModels()[0] || "").onChange((value) => {
            dirty = true;
            selectedTextModel = value;
            setTextAndImageModels();
            refreshTextModelDropdown();
            updateTextModelHelp();
          });
        });
      textModelHelpEl = advancedContent.createEl("p", { cls: "excali-ai-help-text" });

      maxTokensSetting = new ea.obsidian.Setting(advancedContent)
        .setName(t("textMaxTokenOverride"))
        .addText((text) => {
          text.inputEl.type = "number";
          text.inputEl.min = "1";
          text.inputEl.style.width = "100px";
          const placeholderValue = parsePositiveInteger(aiSettings.defaultMaxResponseTokens);
          if (placeholderValue) {
            text.setPlaceholder(String(placeholderValue));
          }
          text.setValue(selectedMaxTokens);
          text.onChange((value) => {
            selectedMaxTokens = String(value ?? "").trim();
            dirty = true;
            updateMaxTokensHelp();
          });
        });
      maxTokensSetting.settingEl.toggleClass("is-disabled", !hasAvailableTextModels());
      maxTokensHelpEl = advancedContent.createEl("p", { cls: "excali-ai-help-text" });

      imageModelSetting = new ea.obsidian.Setting(advancedContent)
        .setName(t("imageModel2"))
        .addDropdown((dropdown) => {
          imageModelSettingDropdown = dropdown;
          refreshImageModelDropdown();
          dropdown.setDisabled(!hasAvailableImageModels());
          dropdown
            .setValue(imageModel || getAvailableImageModels()[0] || "")
            .onChange(async (value) => {
              dirty = true;
              selectedImageModel = value;
              setTextAndImageModels();
              refreshTextModelDropdown();
              refreshImageModelDropdown();
              refreshImageSizeDropdown();
              updateMaskEditSetting();
              updateImageModelHelp();
              if (isImageEditTask()) {
                ({ imageDataURL, maskDataURL } = await generateCanvasDataURL(
                  ea.targetView,
                  shouldGenerateMaskPreview(),
                ));
                updatePreviewSection();
              }
            });
        });
      imageModelHelpEl = advancedContent.createEl("p", { cls: "excali-ai-help-text" });

      maskEditSetting = new ea.obsidian.Setting(advancedContent)
        .setName(t("useMaskEdit"))
        .addToggle((toggle) => {
          maskEditToggleComponent = toggle;
          toggle
            .setValue(shouldUseMaskEdit())
            .setDisabled(!activeImageModelSupportsMaskEdits())
            .onChange(async (value) => {
              dirty = true;
              prefersMaskEdit = value;
              updateMaskEditSetting();
              updateImageModelHelp();
              ({ imageDataURL, maskDataURL } = await generateCanvasDataURL(
                ea.targetView,
                shouldGenerateMaskPreview(),
              ));
              updatePreviewSection();
            });
        });

      imageSizeSetting = new ea.obsidian.Setting(advancedContent)
        .setName(t("imageSize"))
        .addDropdown((dropdown) => {
          imageSizeSettingDropdown = dropdown;
          refreshImageSizeDropdown();
          dropdown.setDisabled(!hasAvailableImageModels());
          dropdown.setValue(imageSize).onChange(async (value) => {
            dirty = true;
            imageSize = value;
            updateImageModelHelp();
            if (isImageEditTask()) {
              ({ imageDataURL, maskDataURL } = await generateCanvasDataURL(
                ea.targetView,
                shouldGenerateMaskPreview(),
              ));
              updatePreviewSection();
            }
          });
        });

      setTextAndImageModels();
      refreshTaskDropdown();
      refreshTextModelDropdown();
      refreshImageModelDropdown();
      refreshImageSizeDropdown();
      updateTaskSpecificControls();

      const runContainer = leftCol.createDiv({ cls: "excali-ai-run-container" });
      const runSetting = new ea.obsidian.Setting(runContainer);
      if (ea.verifyMinimumPluginVersion && ea.verifyMinimumPluginVersion("2.23.4")) {
        runSetting.addButton((button) => {
          button
            .setButtonText(ea.formatAIUsageLabel())
            .setIcon("bar-chart-2")
            .setTooltip(t("viewAiTokenUsageForThisSession"))
            .onClick(() => {
              ea.showAIUsageModal();
            });
        });
      }
      runSetting.addButton((button) =>
        button
          .setButtonText(t("run"))
          .setIcon("play")
          .setTooltip(t("run"))
          .setCta()
          .onClick(() => {
            const taskConfig = getActiveTaskConfig();
            if (!taskConfig) {
              new Notice(t("noRunnableAiTaskIsSelected"), 8000);
              return;
            }
            const taskConfigValidationMessage = getTaskConfigValidationMessage(taskConfig);
            if (taskConfigValidationMessage) {
              new Notice(taskConfigValidationMessage, 8000);
              return;
            }
            if (doesTaskUseTextModel(taskConfig.id) && !hasAvailableTextModels()) {
              new Notice(getMissingModelConfigurationMessage("text"), 8000);
              return;
            }
            if (isImageGenerationTask(taskConfig.id) && !hasAvailableImageModels()) {
              new Notice(getMissingModelConfigurationMessage("image"), 8000);
              return;
            }
            void run(userPrompt).catch(() => {
              new Notice(t("requestFailed"));
            });
            configModal.close();
          }),
      );
    };

    configModal.onClose = async () => {
      detachSelectionListeners();
      unregisterModalCleanup();
      if (dirty) {
        await saveExcaliAISettings();
      }
      if (openTaskEditorAfterClose) {
        openTaskEditorModal({ reopenMainModal: true });
      }
    };

    unregisterModalCleanup = ea.registerCleanup(() => configModal.close());
    configModal.open();
  };

  openConfigModal();
}
