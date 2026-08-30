/**
 * @file styles.ts
 * @overview Scoped CSS for the slideshow sidepanel and sorter.
 */

export const SLIDESHOW_SIDEPANEL_STYLES = `
.slideshow-sidepanel { display:flex; flex-direction:column; gap:12px; padding:10px; height:100%; box-sizing:border-box; container-type:inline-size; container-name:slideshow-panel; }
.slideshow-sidepanel__support { color:var(--text-muted); font-size:var(--font-ui-smaller); line-height:1.3; }
.slideshow-sidepanel__support a { color:var(--text-accent); }
.slideshow-sidepanel__header { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.slideshow-sidepanel__header button { display:inline-flex; align-items:center; justify-content:center; gap:6px; }
.slideshow-sidepanel__header .slideshow-sidepanel__icon-button { width:36px; height:36px; min-width:36px; padding:7px; }
.slideshow-sidepanel__deck-picker { display:flex; align-items:center; gap:8px; }
.slideshow-sidepanel__deck-picker label { color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sidepanel__deck-picker select { min-width:0; flex:1; }
.slideshow-sidepanel__summary { color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sidepanel__path-actions { display:flex; flex-wrap:wrap; gap:8px; }
.slideshow-sidepanel__path-actions button { display:inline-flex; align-items:center; gap:6px; }
.slideshow-sorter { display:flex; flex-direction:column; gap:8px; min-height:0; overflow:auto; padding-right:2px; }
.slideshow-sorter__row { display:flex; flex-direction:column; gap:7px; border:1px solid var(--background-modifier-border); border-radius:8px; padding:8px; background:var(--background-primary); outline:none; }
.slideshow-sorter__row:focus, .slideshow-sorter__row.is-selected { border-color:var(--interactive-accent); box-shadow:0 0 0 1px var(--interactive-accent); }
.slideshow-sorter__row.is-excluded { opacity:.5; }
.slideshow-sorter__row.is-dragging { opacity:.35; }
.slideshow-sorter__top { display:flex; flex-wrap:wrap; gap:5px 8px; align-items:flex-start; padding:6px 8px; border-radius:6px; background:var(--background-secondary); }
.slideshow-sorter__top.is-draggable { cursor:grab; user-select:none; }
.slideshow-sorter__top.is-draggable:active { cursor:grabbing; }
.slideshow-sorter__title { flex:1 1 220px; min-width:0; font-weight:600; white-space:normal; overflow-wrap:break-word; word-break:normal; line-height:1.35; }
.slideshow-sorter__badges { flex:0 1 auto; min-width:0; display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sorter__badge { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; }
.slideshow-sorter__badge svg { width:14px; height:14px; }
.slideshow-sorter__content { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; min-width:0; }
.slideshow-sorter__preview { width:100%; aspect-ratio:16/9; overflow:hidden; border-radius:5px; background:var(--background-secondary); display:flex; align-items:center; justify-content:center; }
.slideshow-sorter__preview svg { width:100%; height:100%; display:block; }
.slideshow-sorter__actions { display:grid; grid-template-columns:repeat(2,30px); gap:3px; align-content:start; }
.slideshow-sorter__actions button { width:30px; height:30px; padding:5px; display:flex; align-items:center; justify-content:center; }
.slideshow-sorter__actions button.is-active { color:var(--interactive-accent); background:var(--background-modifier-hover); }
.slideshow-sorter__actions svg { width:16px; height:16px; }
.slideshow-notes { border-top:1px solid var(--background-modifier-border); padding-top:8px; display:flex; flex-direction:column; gap:7px; }
.slideshow-notes textarea { width:100%; min-height:100px; resize:vertical; box-sizing:border-box; }
.slideshow-notes__hint, .slideshow-warning, .slideshow-empty { color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-warning { padding:8px; border-radius:6px; background:var(--background-secondary); }
.slideshow-sorter__animation { border-top:1px solid var(--background-modifier-border); padding-top:8px; }
.slideshow-animation-editor { display:flex; flex-direction:column; gap:10px; min-height:0; overflow:visible; padding-bottom:4px; }
.slideshow-animation-editor__hint, .slideshow-animation-editor__muted { color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-animation-editor__section { display:flex; flex-direction:column; gap:6px; }
.slideshow-animation-editor__section-title { font-weight:600; font-size:var(--font-ui-small); }
.slideshow-animation-editor__targets { display:flex; flex-wrap:wrap; gap:5px; }
.slideshow-animation-editor__target { display:inline-flex; align-items:center; gap:4px; padding:3px 4px 3px 7px; border-radius:999px; background:var(--background-secondary); font-size:var(--font-ui-smaller); }
.slideshow-animation-editor__target button { width:22px; height:22px; min-width:22px; padding:3px; display:flex; align-items:center; justify-content:center; }
.slideshow-animation-editor__form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.slideshow-animation-editor__form label { display:flex; flex-direction:column; gap:4px; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-animation-editor__form select, .slideshow-animation-editor__form input { width:100%; box-sizing:border-box; }
.slideshow-animation-editor__form-actions { display:flex; flex-wrap:wrap; gap:6px; }
.slideshow-animation-editor__form-actions button { display:inline-flex; align-items:center; gap:5px; }
.slideshow-animation-editor__steps { display:flex; flex-direction:column; gap:6px; }
.slideshow-animation-editor__step { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; padding:6px; border:1px solid var(--background-modifier-border); border-radius:6px; background:var(--background-primary); }
.slideshow-animation-editor__step.is-selected { border-color:var(--interactive-accent); box-shadow:0 0 0 1px var(--interactive-accent); }
.slideshow-animation-editor__step-summary { min-width:0; text-align:left; white-space:normal; }
.slideshow-animation-editor__step-actions { display:grid; grid-template-columns:repeat(2,28px); gap:3px; }
.slideshow-animation-editor__step-actions button { width:28px; height:28px; padding:4px; display:flex; align-items:center; justify-content:center; }

@container slideshow-panel (max-width: 390px) {
  .slideshow-sidepanel__deck-picker { flex-direction:column; align-items:stretch; }
  .slideshow-sidepanel__deck-picker label { align-self:flex-start; }
  .slideshow-animation-editor__form { grid-template-columns:1fr; }
  .slideshow-animation-editor__step { grid-template-columns:1fr; }
  .slideshow-animation-editor__step-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; }
  .slideshow-sorter__content {
    grid-template-columns:1fr;
    grid-template-areas:
      "preview"
      "actions";
    align-items:center;
  }
  .slideshow-sorter__preview { grid-area:preview; }
  .slideshow-sorter__actions {
    grid-area:actions;
    display:flex;
    flex-wrap:wrap;
    justify-content:flex-end;
    align-items:center;
  }
}

@container slideshow-panel (max-width: 300px) {
  .slideshow-sorter__actions { justify-content:flex-start; }
}

.slideshow-sidepanel button svg { width:16px; height:16px; }
`;

/** Scoped styles for the script-owned presenter popout. */
export const SLIDESHOW_PRESENTER_STYLES = `
.slideshow-presenter { display:flex; flex-direction:column; gap:14px; height:100%; box-sizing:border-box; padding:16px; overflow:auto; background:var(--background-primary); color:var(--text-normal); }
.slideshow-presenter__header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.slideshow-presenter__heading { min-width:0; display:flex; flex-direction:column; gap:3px; }
.slideshow-presenter__title { font-size:var(--font-ui-large); font-weight:700; line-height:1.25; overflow-wrap:anywhere; }
.slideshow-presenter__counter { color:var(--text-muted); font-size:var(--font-ui-small); }
.slideshow-presenter__close { flex:0 0 auto; width:38px; height:38px; display:flex; align-items:center; justify-content:center; }
.slideshow-presenter__grid { display:grid; grid-template-columns:minmax(220px,.8fr) minmax(300px,1.2fr); gap:16px; align-items:start; }
.slideshow-presenter__column { min-width:0; display:flex; flex-direction:column; gap:9px; }
.slideshow-presenter__section-title { color:var(--text-muted); font-size:var(--font-ui-smaller); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.slideshow-presenter__preview { width:100%; overflow:hidden; border-radius:8px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); display:flex; align-items:center; justify-content:center; }
.slideshow-presenter__preview svg { width:100%; height:100%; display:block; }
.slideshow-presenter__current-preview { max-width:520px; }
.slideshow-presenter__next-preview { width:100%; }
.slideshow-presenter__end { display:flex; align-items:center; justify-content:center; min-height:180px; color:var(--text-muted); font-size:var(--font-ui-medium); border:1px dashed var(--background-modifier-border); border-radius:8px; }
.slideshow-presenter__notes { min-height:120px; padding:12px; border-radius:8px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); overflow-wrap:anywhere; }
.slideshow-presenter__notes.is-empty { color:var(--text-muted); font-style:italic; }
.slideshow-presenter__progress { display:flex; align-items:center; gap:8px; color:var(--text-muted); font-size:var(--font-ui-small); }
.slideshow-presenter__controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:auto; padding-top:4px; }
.slideshow-presenter__controls button { min-width:44px; min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
.slideshow-presenter__controls svg, .slideshow-presenter__close svg { width:18px; height:18px; }
@media (max-width: 700px) {
  .slideshow-presenter__grid { grid-template-columns:1fr; }
  .slideshow-presenter__current-preview { max-width:none; }
}
`;
