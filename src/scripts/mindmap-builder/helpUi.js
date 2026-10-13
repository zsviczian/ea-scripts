/**
 * @file helpUi.js
 * @overview help Ui implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createHelpUi(runtimeContext) {
  const getInstructions = () => `
<br>

${runtimeContext.t("INSTRUCTIONS")}

<div class="ex-coffee-div"><a href="https://ko-fi.com/zsolt"><img src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" border="0" alt="Buy Me a Coffee at ko-fi.com"  height=45></a></div>

<a href="https://www.youtube.com/watch?v=5G9QF-u9w0Q" target="_blank"><img src ="https://i.ytimg.com/vi/5G9QF-u9w0Q/maxresdefault.jpg" style="max-width:560px; width:100%"></a>
`;

  const renderHelp = (container) => {
    runtimeContext.helpContainer = container.createDiv();
    runtimeContext.detailsEl = runtimeContext.helpContainer.createEl("details");
    const summary = runtimeContext.detailsEl.createEl("summary", {
      attr: {
        style: "cursor: pointer;",
      },
    });
    // Title
    summary.createSpan({
      text: runtimeContext.t("HELP_SUMMARY"),
      attr: {
        style: "font-weight: bold;",
      },
    });
    // Version Number
    summary.createSpan({
      text: runtimeContext.VERSION,
      attr: {
        style: "float: right; color: var(--text-muted); font-size: 0.8em;",
      },
    });
    runtimeContext.ea.obsidian.MarkdownRenderer.render(
      app,
      getInstructions(),
      runtimeContext.detailsEl.createDiv(),
      "",
      runtimeContext.ea.plugin,
    );
  };
  return { getInstructions, renderHelp };
}
