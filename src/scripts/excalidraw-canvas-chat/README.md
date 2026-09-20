# Excalidraw Canvas Chat

A persistent, tool-using AI chat sidepanel for working directly with Excalidraw canvases and Obsidian notes.

## Highlights

- Uses the existing **Excalidraw AI** provider/model configuration and never stores API keys.
- Persists the sidepanel and chat history; conversations are saved to local storage and can be resumed later.
- Chat text is selectable, and the header copy button copies the current conversation as Markdown.
- Shows an approximate current-context token count and links to Excalidraw's session-wide AI usage view.
- Includes optional developer-console debug logging for model requests/responses, parsed tool calls, tool results, and failures; each log entry is emitted as a single copy-friendly text string.
- Sends a compact scene/selection summary first instead of serializing the complete `.excalidraw` scene.
- Fetches exact element properties, typed scene slices, or low-resolution canvas bitmaps only when the agent decides they are needed.
- Adds viewport bounds and coarse occupied scene regions to the compact context so large canvases can be explored region-by-region instead of being serialized wholesale.
- Provides layout inspection with a quality gate that separates real sibling collisions from intentional panel containment, reports text-as-graphics anti-patterns, color-hierarchy weakness, and placement anchors.
- Automatically captures a high-detail post-mutation neighborhood bitmap for complex multi-element creations/re-layouts. Real layout collisions keep the turn open until the agent repairs them and a later review passes.
- Can search the canonical ExcalidrawAutomate agent skill, generated type definitions, API usage index, and real example scripts on GitHub when it encounters an Excalidraw-specific capability it does not know exactly.
- Can discover methods available in the installed EA/ExcalidrawAPI runtime so newer documentation does not cause blind calls into an older plugin.
- Reads the active Markdown note, searches/reads other vault files on demand, and can navigate to a file without modifying note contents.

## Canvas tools

Canvas Chat can:

- inspect the selection, a targeted element set, or the scene;
- create text, rectangles, ellipses, diamonds, sticky notes, lines, arrows, and frames;
- build polished forms/templates/worksheets with `create_visual_template`, which uses real field lines, colored panels, shape checkboxes/bullets, consistent gutters, and automatic frame sizing instead of underscore/ASCII placeholders;
- update wording, position, size, angle, colors, stroke width, roughness, opacity, and text size;
- delete, group, select, and zoom to elements;
- convert line/arrow/freedraw elements while preserving element IDs;
- connect existing elements with native bound arrows and optional labels;
- create native Excalidraw diagrams from Mermaid;
- render LaTeX formulas using ExcalidrawAutomate;
- create normal or marker frames and semantically convert existing frames between those roles;
- generate images with the configured image model or transform the current selection as a raster source;
- request a bitmap of the selection or canvas when visual understanding is more useful than element metadata;
- inspect the visible viewport, specific IDs, a bounded area, or coarse scene regions without requesting the whole drawing;
- fall back to a compact, self-contained ExcalidrawAutomate JavaScript snippet for advanced features that do not have a dedicated Canvas Chat shortcut. Generated snippets run against the current `ea` instance, must commit their own changes, and return a structured change summary.

## Agent design

The model follows a bounded JSON tool protocol. Common actions use narrow, validated Canvas Chat tools. For an unfamiliar Excalidraw-specific concept it is instructed to search the canonical `docs/AITrainingData/excalidraw-automate` skill/reference set instead of guessing. If the needed EA capability is not wrapped by a shortcut, the agent can generate and execute a small JavaScript body against the injected `ea` runtime.

Each turn starts with compact context: bound canvas, active file, scene bounds, viewport bounds, element counts, selection, and (for larger scenes) a handful of coarse occupied regions. The model can then ask for only a relevant type, region, ID set, layout summary, or bitmap. It is explicitly told to interpret ASCII trees/indented outlines as structure rather than literal whitespace, to prefer Mermaid or another structured layout over hand-positioning many independent text/line elements, and to use real Excalidraw shapes instead of underscores, `[ ]`, repeated spaces, or ASCII separators. Templates/forms are routed to a semantic template-layout tool that handles spacing and restrained color hierarchy.

Complex multi-element mutations trigger an automatic visual review. Canvas Chat captures the changed neighborhood as a high-detail bitmap together with lightweight layout diagnostics and sends that back to the model. Layout diagnostics distinguish expected containment (for example, a heading inside a panel or a checkbox inside a section) from actual sibling collisions. A failed quality gate prevents a premature “done” response until the collisions are repaired and a subsequent review passes. The review also calls out underscore placeholders, text checkboxes, space-based alignment, and low color hierarchy.

Reasoning models such as GPT-5 receive a safe minimum response budget even if the saved UI value is lower; otherwise hidden reasoning can consume the full response allowance before the model emits the JSON tool envelope. A provider response that still ends at its length limit with no protocol output is retried without surfacing a false turn failure. If a response contains malformed JSON, the retry receives the malformed response and is explicitly required to preserve the same intended mutations instead of silently abandoning them and claiming completion.

Saved history may be long, but only a bounded recent transcript is included in the live model context. Exact repeated messages and old failed-turn assistant messages are dropped from the live prompt. Tool results are capped, and bitmap inspection uses low detail by default. This keeps large drawings and long conversations from being resent unnecessarily while still retaining conversational continuity.

## Diagnostic prompts

When improving Canvas Chat, these prompts exercise different parts of the agent. Enable **Debug logging**, run one prompt per fresh chat, and capture the complete Canvas Chat console entries.

1. **Large-scene targeting** — “Do not change anything. Explain the major spatial regions of this canvas, tell me which region you would inspect to understand the selected idea, then inspect only that region and summarize it.”
2. **Structured-diagram choice** — “Illustrate this hierarchy as a clean diagram. Treat indentation as structure and bracketed annotations as separate categories/badges, not literal aligned text: …” followed by an ASCII tree.
3. **Visual self-review** — “Create a six-step left-to-right workflow with two branches, then inspect your own result and fix any overlaps, clipping, line crossings, or weak spacing before you finish.”
4. **Spatial edit in an existing drawing** — “Move the selected cluster into nearby empty space, preserve its internal layout, connect it to the most relevant neighboring concept, then verify visually that nothing overlaps.”
5. **Semantic Excalidraw feature lookup** — “Convert the selected frame to a marker frame, preserve its appearance, and explain which Excalidraw property/API you used.”
6. **Visual template composition** — “Create a meeting-notes template with Date, Time, Organizer and Attendees fields; Agenda, Notes, Action Items, Decisions and Parking Lot sections; use subtle color hierarchy, real field lines and checkboxes, and fix your own layout before finishing.”

Useful logs include the compact context, chosen model, requested/effective response budget, finish reason, provider token usage (including reasoning tokens where available), tool timings, tool inputs/results, changed IDs, and the automatic visual-review summary. Image data itself is replaced in debug output by its character count so the console remains copyable.

## Example requests

- “Improve the wording of the selected diagram and make the labels more consistent.”
- “Turn the active note into a simple process diagram next to this selection.”
- “Read this whiteboard, explain what it says, then add three clarification sticky notes.”
- “Create a slide frame around the selected elements and add a concise title.”
- “Find my notes about OAuth and add the missing authorization-code step to this flow.”
- “Convert these lines to arrows, connect the two boxes, and zoom to the result.”
- “Add the quadratic formula in LaTeX below this example.”
- “Generate a small illustrative image for this concept and place it to the right.”
