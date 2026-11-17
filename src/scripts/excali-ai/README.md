# ExcaliAI

Generate HTML, Mermaid, mind maps, editable SVG strokes and images from a canvas selection and a prompt. Includes an editable task library, image transforms, mask edits, aspect-ratio previews and response token overrides.

Uses **Excalidraw AI** provider profiles and model preferences, including OpenAI reasoning effort. Configure keys in the plugin (obfuscated vault settings or device-local Obsidian SecretStorage); this script never stores API keys. Your chosen task sends its prompt and, when enabled, selected canvas image to that provider.

Requires Excalidraw 2.29.2 or newer. Open a drawing and run **ExcaliAI**. Preserve that script filename when replacing an older copy so its task library and preferences remain under the same Script Engine settings key.

The migration preserves legacy settings and task IDs. Existing JavaScript modal/export orchestration remains in run.js, with import-safe task helpers and typed request helpers. New script UI strings and default prompts are in lang/en.ts; maintained locale files use English fallback for untranslated advanced content.

Build: npm run build. Deploy build/excali-ai/excali-ai.md as ea-scripts/ExcaliAI.md in the plugin repository.

Validation uses fake providers and keys. Verify live providers, mask edits and generated content separately with your own API access.

Tutorial: https://www.youtube.com/watch?v=A1vrSGBbWgo

Maintained source: https://github.com/zsviczian/ea-scripts/tree/main/src/scripts/excali-ai
