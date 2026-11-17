/** English source of truth, including editable default task prompts. */
export const en = {
  scriptFailed:
    "ExcaliAI could not start. Check that your drawing is open and the selected images are available.",
  requestFailed: "ExcaliAI could not complete this task. Check your model settings and try again.",
  errorTitle: "Error",
  thisScriptRequiresExcalidrawOrLaterPlease:
    "This script requires Excalidraw 2.23.0 or later. Please update the plugin.",
  textResponse: "Text response",
  usesTheTextOrMultimodalModelAnd:
    "Uses the text or multimodal model and returns structured output such as HTML, Mermaid, a mind map, or Excalidraw strokes.",
  writePromptThenGenerateImage: "Write prompt, then generate image",
  usesTheTextModelToWriteAn:
    "Uses the text model to write an image prompt from the canvas selection and/or user prompt, then sends that prompt to the image model.",
  sendPromptStraightToImageModel: "Send prompt straight to image model",
  sendsOnlyTheUserSPromptTo:
    "Sends only the user's prompt to the image model. No text-model prompt writing step and no canvas image input.",
  editSelectedImage: "Edit selected image",
  usesTheSelectedImageAsTheSource:
    "Uses the selected image as the source and applies either a mask edit or a prompt-based transform.",
  embedsTheResponseAsASingleHtml: "Embeds the response as a single HTML result.",
  mindMap: "Mind Map",
  importsTheResponseIntoMindmapBuilder: "Imports the response into MindMap Builder.",
  mermaid: "Mermaid",
  createsAMermaidDiagram: "Creates a Mermaid diagram.",
  excalidrawStrokes: "Excalidraw Strokes",
  usesSvgBehindTheScenesToGenerate: "Uses SVG behind the scenes to generate Excalidraw strokes.",
  imagePromptNote: "Image + prompt note",
  generatesAnImageAndAddsTheModel:
    "Generates an image and adds the model's revised prompt underneath when available.",
  imageOnly: "Image only",
  generatesOnlyTheImageWithoutAddingThe:
    "Generates only the image, without adding the revised prompt underneath.",
  mindmapBuilder: "MindMap Builder",
  none: "None",
  turnThisIntoASingleHtmlFile:
    "Turn this into a single html file using tailwind. Return a single message containing only the html file in a codeblock.",
  returnOnlyTheMindMapAsPlain:
    "Return only the mind map as plain text. Use one # heading for the central node, then nested - bullets for branches. Do not use bold, italics, code fences, tables, or explanatory text.",
  returnASingleMessageContainingOnlyThe:
    "Return a single message containing only the mermaid diagram in a codeblock.",
  returnASingleMessageContainingOnlyThe2:
    "Return a single message containing only the SVG code in an html codeblock.",
  returnASingleMessageWithTheGenerated:
    "Return a single message with the generated image prompt in a codeblock",
  task: "Task {value1}",
  challengeMyThinking: "Challenge my thinking",
  turnTheSelectedImageAndOptionalPrompt:
    "Turn the selected image and optional prompt into a Mermaid mind map. If conversion fails, open More Tools > Mermaid to Excalidraw and edit the generated script.",
  yourTaskIsToInterpretAScreenshot:
    "Your task is to interpret a screenshot of a whiteboard, translating its ideas into a Mermaid graph. The whiteboard will encompass thoughts on a subject. Within the mind map, distinguish ideas that challenge, dispute, or contradict the whiteboard content. Additionally, include concepts that expand, complement, or advance the user's thinking. Utilize the Mermaid graph diagram type and present the resulting Mermaid diagram within a code block. Ensure the Mermaid script excludes the use of parentheses ().",
  convertSketchToShapes: "Convert sketch to shapes",
  convertSelectedSketchesIntoExcalidrawStrokesWorks:
    "Convert selected sketches into Excalidraw strokes. Works best with a small number of simple shapes. Experimental.",
  givenAnImageFeaturingVariousGeometricShapes:
    "Given an image featuring various geometric shapes drawn by the user, your objective is to analyze the input and generate SVG code that accurately represents these shapes. Your output will be the SVG code enclosed in an HTML code block.",
  createASimpleExcalidrawIcon: "Create a simple Excalidraw icon",
  turnATextPromptIntoASimple:
    "Turn a text prompt into a simple icon and insert it into Excalidraw as strokes. Text prompt only. Experimental.",
  givenADescriptionOfAnSvgImage:
    "Given a description of an SVG image from the user, your objective is to generate the corresponding SVG code. Avoid incorporating textual elements within the generated SVG. Your output should be the resulting SVG code enclosed in an HTML code block.",
  createAStickFigure: "Create a stick figure",
  sendOnlyTheTextPromptToThe:
    "Send only the text prompt to the configured image model. Be specific. To keep the prompt unchanged, start with: 'DO NOT add any detail, just use it AS-IS:'",
  youWillReceiveAPromptFromThe:
    "You will receive a prompt from the user. Your task involves drawing a simple stick figure or a scene involving a few stick figures based on the user's prompt. Create the stick figure based on the following style description. DO NOT add any detail, just use it AS-IS: Create a simple stick figure character with a large round head and a face in the style of sketchy caricatures. The stick figure should have a rudimentary body composed of straight lines representing the arms and legs. Hands and toes should be represented with round shapes, do not add details such as fingers or toes. Use fine lines, smooth curves, rounded shapes. The stick figure should retain a playful and childlike simplicity, reminiscent of a doodle someone might draw on the corner of a notebook page. Create a black and white drawing, a hand-drawn figure on white background.",
  editAnImage: "Edit an image",
  imageElementsAreUsedAsTheSource:
    "Image elements are used as the source image. In mask mode, shapes on top become the mask. Turn mask edit off to flatten non-image elements into the source image and apply a prompt-based transform.",
  generateAnImageFromImageAndPrompt: "Generate an image from image and prompt",
  generateAnImageFromTheSelectedImage:
    "Generate an image from the selected image and your prompt. Add context in the prompt to guide how the image should be interpreted.",
  yourTaskInvolvesReceivingAnImageAnd:
    "Your task involves receiving an image and a textual prompt from the user. Your goal is to craft a detailed, accurate, and descriptive narrative of the image, tailored for effective image generation. Utilize the user-provided text prompt to inform and guide your depiction of the image. Ensure the resulting image remains text-free.",
  generateAnImageFromPrompt: "Generate an image from prompt",
  generateAnImageToIllustrateAQuote: "Generate an image to illustrate a quote",
  turnAQuoteIntoAnIllustratedScene:
    "Turn a quote into an illustrated scene. Include the author's name if you want the result to reference them.",
  yourTaskInvolvesTransformingAUserProvided:
    "Your task involves transforming a user-provided quote into a detailed and imaginative illustration. Craft a visual representation that captures the essence of the quote and resonates well with a broad audience. If the Author's name is provided, aim to establish a connection between the illustration and the Author. This can be achieved by referencing a well-known story from the Author, situating the image in the Author's era or setting, or employing other creative methods of association. Additionally, provide preferences for styling, such as the chosen medium and artistic direction, to guide the image creation process. Ensure the resulting image remains text-free. Your task output should comprise a descriptive and detailed narrative aimed at facilitating the creation of a captivating illustration from the quote.",
  generateIconVariantsBasedOnInputImage: "Generate 4 icon-variants based on input image",
  generateAXSheetOfFourIcon:
    "Generate a 2x2 sheet of four icon variations from the selected sketch. Add a prompt if you want to steer the result.",
  givenASimpleSketchAndAnOptional:
    "Given a simple sketch and an optional text prompt from the user, your task is to generate a descriptive narrative tailored for effective image generation, capturing the style of the sketch. Utilize the text prompt to guide the description. Your objective is to instruct DALL-E to create a collage of four minimalist black and white hand-drawn pencil sketches in a 2x2 matrix format. Each sketch should convert the user's sketch into simple artistic SVG icons with transparent backgrounds. Ensure the resulting images remain text-free, maintaining a minimalist, easy-to-understand style, and omit framing borders. Only include a pencil in the drawing if it is explicitly mentioned in the user prompt or included in the sketch.",
  visualBrainstorm: "Visual brainstorm",
  generateAnImageFromTheSelectedImage2:
    "Generate an image from the selected image and prompt to spark new ideas.",
  yourObjectiveIsToInterpretAScreenshot:
    "Your objective is to interpret a screenshot of a whiteboard, creating an image aimed at sparking further thoughts on the subject. The whiteboard will present diverse ideas about a specific topic. Your generated image should achieve one of two purposes: highlighting concepts that challenge, dispute, or contradict the whiteboard content, or introducing ideas that expand, complement, or enrich the user's thinking. You have the option to include multiple tiles in the resulting image, resembling a sequence akin to a comic strip. Ensure that the image remains devoid of text.",
  wireframeToCode: "Wireframe to code",
  interpretTheSelectedWireframeAndGenerateA:
    "Interpret the selected wireframe and generate a web app as a single HTML file. You can copy the result from the embeddable menu.",
  youAreAnExpertTailwindDeveloperA:
    "You are an expert tailwind developer. A user will provide you with a low-fidelity wireframe of an application and you will return a single html file that uses tailwind to create the website. Use creative license to make the application more fleshed out. Write the necessary javascript code. If you need to insert an image, use placehold.co to create a placeholder image.",
  createMindmap: "Create Mindmap",
  createAHierarchicalMindMapFromThe:
    "Create a hierarchical mind map from the selected image, if any, and your prompt, then import it into MindMap Builder. Requires MindMap Builder to be available.",
  youWillReceiveATextPromptAnd:
    "You will receive a text prompt and may also receive an image. Create a mind map as a hierarchical plain-text outline based on the image content, if provided, and the text prompt. Return only the mind map. Use exactly one markdown H1 heading for the central node, then - bullets for branches and indented - bullets for sub-branches. Do not use bold, italics, code fences, numbering, commentary, or any markdown formatting other than the heading and bullet list.",
  excalidrawAiIsDisabledOrUnavailableEnable:
    "Excalidraw AI is disabled or unavailable. Enable it in plugin settings.",
  noRunnableAiTasksAreConfiguredOpen:
    "No runnable AI tasks are configured. Open Task Editor to add a task or reset the shipped presets.",
  taskUsesAnImageResultWithUse:
    'Task "{value1}" uses an image result with {value2}. Use {value3} or {value4} instead.',
  taskMustUseAnImageResultWhen:
    'Task "{value1}" must use an image result when {value2} is selected.',
  taskCannotSendACanvasImageWhen:
    'Task "{value1}" cannot send a canvas image when {value2} is selected.',
  taskMustUseTheImageResultWhen:
    'Task "{value1}" must use the image result when {value2} is selected.',
  taskCanOnlyEnableMaskModeWhen:
    'Task "{value1}" can only enable mask mode when {value2} is selected.',
  noTextOrMultimodalModelsAreReady:
    "No text or multimodal models are ready to use. Add an API key to a provider profile and assign at least one text model in Excalidraw AI settings.",
  noImageModelsAreReadyToUse:
    "No image models are ready to use. Add an API key to a provider profile and assign at least one image model in Excalidraw AI settings.",
  theSelectedTextModelIsnTConfigured:
    "The selected text model ({value1}) isn't configured in Excalidraw AI settings.",
  theProviderProfileForTextModelIs:
    "The provider profile ({value1}) for text model {value2} is missing from Excalidraw AI settings.",
  theSelectedProviderProfileDoesnTHave:
    "The selected provider profile ({value1}) doesn't have an API key configured.",
  theSelectedTextModelIsSetTo:
    "The selected text model ({value1}) is set to text-only. Choose a multimodal model for image analysis tasks.",
  theProviderProfileForImageModelIs:
    "The provider profile ({value1}) for image model {value2} is missing from Excalidraw AI settings.",
  theSelectedImageModelDoesnTSupport:
    "The selected image model ({value1}) doesn't support prompt-based transforms in Excalidraw AI settings.",
  theSelectedImageModelDoesnTSupport2:
    "The selected image model ({value1}) doesn't support mask-based edits in Excalidraw AI settings.",
  theImageRequestFailed: "The image request failed.",
  somethingWentWrongCheckDeveloperConsoleFor:
    "Something went wrong! Check developer console for more.",
  localstorageSetitemError: "localStorage.setItem error: {value1}",
  selectContentBeforeRunningExcaliai: "Select content before running ExcaliAI.",
  enterAPromptBeforeRunningExcaliai: "Enter a prompt before running ExcaliAI.",
  enterAPromptOrSelectContentBefore: "Enter a prompt or select content before running ExcaliAI.",
  enterInstructionsForHowTheImageShould: "Enter instructions for how the image should be changed.",
  selectAnImage: "Select an image.",
  selectCanvasContentBeforeRunningThisTask: "Select canvas content before running this task.",
  selectOrCreateAMask: "Select or create a mask.",
  unexpectedExcalidrawautomateError: "Unexpected ExcalidrawAutomate error.",
  theModelHitTheTokenLimitBefore:
    "The model hit the token limit before it finished the HTML output. Increase 'Text max token override' in ExcaliAI or raise the default AI response token limit in plugin settings.",
  mindmapBuilderIsNotAvailable: "MindMap Builder is not available.",
  couldNotConnectToMindmapBuilder: "Could not connect to MindMap Builder.",
  couldNotCreateTheMindMap: "Could not create the mind map.",
  mindMapCreatedInMindmapBuilder: "Mind map created in MindMap Builder.",
  openMoreToolsMermaidToExcalidrawTo:
    "Open [More Tools > Mermaid to Excalidraw] to review and fix the generated Mermaid script.<br><br>",
  openMoreToolsMermaidToExcalidrawTo2:
    "Open More Tools > Mermaid to Excalidraw to review or edit the generated diagram.",
  newTask: "New Task {value1}",
  describeWhatThisTaskDoes: "Describe what this task does.",
  thisTaskIgnoresTheCurrentCanvasSelection:
    "This task ignores the current canvas selection and uses only the text prompt.",
  maskEditIsOffNonImageElements:
    "Mask edit is off. Non-image elements are flattened into the preview image and sent as a prompt-based transform.",
  thisModelDoesnTSupportMaskEdits:
    "This model doesn't support mask edits. Non-image elements are flattened into the preview image and sent as a prompt-based transform.",
  determinesHowTheTaskRuns: "Determines how the task runs.",
  controlsHowExcaliaiInterpretsTheModelResponse:
    "Controls how ExcaliAI interprets the model response.",
  validationNoTasksConfiguredAddATask:
    "<b>Validation:</b> No tasks configured. Add a task or reset the shipped presets.",
  validation: "<b>Validation:</b> {value1}",
  validationTaskConfigurationIsValid: "<b>Validation:</b> Task configuration is valid.",
  excaliaiTaskEditor: '{value1} <h2 style="margin: 0;">ExcaliAI Task Editor</h2>',
  tasksAreStoredInExcaliaiSScript:
    "Tasks are stored in ExcaliAI's script settings JSON. Edit the fields below to add, remove, or change how a task runs.",
  task2: "Task",
  selectWhichTaskToEdit: "Select which task to edit.",
  px: "1 1 220px",
  addTask: " Add task",
  deleteTask: " Delete task",
  noTaskIsSelected: "No task is selected.",
  deleteTheTask: 'Delete the task "{value1}"?',
  resetDefaults: " Reset defaults",
  resetAllExcaliaiTasksToTheShipped:
    "Reset all ExcaliAI tasks to the shipped defaults? This overwrites custom tasks.",
  taskId: "Task ID",
  settingsKeyNormalizedToLowercaseWithDashes: "Settings key, normalized to lowercase with dashes.",
  taskName: "Task name",
  shownInTheExcaliaiTaskPicker: "Shown in the ExcaliAI task picker.",
  taskHelp: "Task help",
  explainsTheTaskInTheMainExcaliai: "Explains the task in the main ExcaliAI dialog.",
  systemPrompt: "System prompt",
  sentToTheTextModelWhenThe: "Sent to the text model when the task uses a text-model step.",
  outputInstruction: "Output instruction",
  controlsTheExpectedResponseFormatWhenThe:
    "Controls the expected response format when the task uses a text-model step.",
  executionMode: "Execution mode",
  resultType: "Result type",
  userPrompt: "User prompt",
  controlsWhetherTheMainPromptBoxIs:
    "Controls whether the main prompt box is optional, required, or hidden for this task.",
  optional: "Optional",
  required: "Required",
  disabled: "Disabled",
  canvasImageInput: "Canvas image input",
  controlsWhetherTheSelectedCanvasContentIs:
    "Controls whether the selected canvas content is optional, required, or ignored.",
  maskMode: "Mask mode",
  availableOnlyInEditSelectedImageMode: "Available only in Edit selected image mode.",
  optionalToggle: "Optional toggle",
  alwaysRequired: "Always required",
  done: " Done",
  excaliai: "{value1} <h2>ExcaliAI</h2>",
  mindmapBuilderApiIsNotActiveThe:
    '{value1} <span><b>MindMap Builder API is not active.</b> The "Create Mindmap" task requires it to be running.</span>',
  textModelNoRunnableTaskIsSelected: "<b>Text model:</b> No runnable task is selected.",
  textModelThisTaskDoesNotUse: "<b>Text model:</b> This task does not use a text model.",
  textModel: "<b>Text model:</b> {value1}",
  theSelectedCanvasImageWillAlsoBe: "The selected canvas image will also be sent to this model.",
  onlyTheTextPromptWillBeSent: "Only the text prompt will be sent to this model.",
  textModelProviderThisModelIs:
    "<b>Text model:</b> {value1}. <b>Provider:</b> {value2}. This model is {value3}. {value4}",
  imageModelNoRunnableTaskIsSelected: "<b>Image model:</b> No runnable task is selected.",
  imageModelThisTaskDoesNotUse: "<b>Image model:</b> This task does not use an image model.",
  imageModel: "<b>Image model:</b> {value1}",
  doesnTSupportPromptTransforms: "doesn't support prompt transforms",
  supportsPromptTransforms: "supports prompt transforms",
  doesnTSupportMaskEdits: "doesn't support mask edits",
  supportsMaskEdits: "supports mask edits",
  maskEditIsOnSoNonImage: "Mask edit is on, so non-image elements are sent as the mask.",
  maskEditIsOffSoNonImage:
    "Mask edit is off, so non-image elements are flattened into the source image.",
  thisModelDoesnTSupportMaskEdits2:
    "This model doesn't support mask edits, so non-image elements are flattened into the source image.",
  imageModelSizesThisModelAndIf:
    "<b>Image model:</b> {value1}. <b>Sizes:</b> {value2}. This model {value3} and {value4}. If the selected image or mask does not match the chosen aspect ratio, ExcaliAI expands the export frame to fit the target ratio instead of cropping the content. {value5}",
  thisTaskAlwaysUsesMaskEdit: "This task always uses mask edit.",
  thisTaskRequiresMaskEditButThe:
    "This task requires mask edit, but the selected model does not support it.",
  onNonImageElementsBecomeTheMask:
    "On: non-image elements become the mask. Off: non-image elements are flattened into the source image for a prompt-based transform.",
  thisModelDoesnTSupportMaskEdits3:
    "This model doesn't support mask edits. ExcaliAI will flatten non-image elements into the source image and use a prompt-based transform.",
  textMaxTokensThisTaskDoesNot: "<b>Text max tokens:</b> This task does not use a text model.",
  usingTheExcaliaiOverride: "Using the ExcaliAI override.",
  usingThePluginDefaultResponseTokenLimit: "Using the plugin default response token limit.",
  usingTheSharedAiRuntimeDefaultBehavior: "Using the shared AI runtime default behavior.",
  textMaxTokens: "<b>Text max tokens:</b> {value1}. {value2}",
  preview: "Preview",
  noRunnableTaskIsSelected: "No runnable task is selected.",
  selectContentOnTheCanvasThisTask:
    "Select content on the canvas. This task requires an image input.",
  nothingIsSelectedSoOnlyTheText:
    "Nothing is selected, so only the text prompt will be sent to the configured text model.",
  thisTaskUsesOnlyTheTextPrompt:
    "This task uses only the text prompt and ignores canvas selection.",
  howItWorks: "<b>How it works:</b> {value1}",
  howItWorksNoRunnableTaskIs: "<b>How it works:</b> No runnable task is selected.",
  taskConfig: "<b>Task config:</b> {value1}",
  selectTheTaskYouWantToRun: "Select the task you want to run.",
  editTasks: " Edit tasks",
  prompt: "Prompt",
  advancedSettings: "{value1} <span>Advanced Settings</span>",
  textModel2: "Text model",
  textMaxTokenOverride: "Text max token override",
  imageModel2: "Image model",
  useMaskEdit: "Use mask edit",
  imageSize: "Image size",
  viewAiTokenUsageForThisSession: "View AI token usage for this session",
  run: " Run",
  noRunnableAiTaskIsSelected: "No runnable AI task is selected.",
  noView: "Open an Excalidraw drawing first.",
  generating: "Generating...",
  advancedPromptWarning: "Advanced: change this only if you know why.",
  reasoningHelp: "Reasoning effort: {effort} (from Excalidraw AI settings).",
  reasoningDefault: "API default",
  requiresVersion: "This script requires Excalidraw 2.29.2 or later. Please update the plugin.",
} as const;
export type ExcaliAITranslationKey = keyof typeof en;
