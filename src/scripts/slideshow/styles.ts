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
.slideshow-sidepanel__launch-main { flex:0 0 auto; }
.slideshow-sidepanel__launch-settings { border:1px solid var(--background-modifier-border); border-radius:8px; background:var(--background-secondary-alt); overflow:visible; }
.slideshow-sidepanel__launch-settings-summary { cursor:pointer; padding:8px 10px; color:var(--text-muted); font-size:var(--font-ui-small); font-weight:600; user-select:none; }
.slideshow-sidepanel__launch-settings[open] .slideshow-sidepanel__launch-settings-summary { border-bottom:1px solid var(--background-modifier-border); }
.slideshow-sidepanel__launch-options { display:flex; flex-direction:column; gap:7px; padding:9px; }
.slideshow-sidepanel__launch-option { display:block; min-width:0; }
.slideshow-sidepanel__launch-option select { width:100%; min-width:0; }
.slideshow-sidepanel__display-controls { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:0 9px 9px; }
.slideshow-sidepanel__display-controls label { min-width:0; display:flex; flex-direction:column; gap:4px; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sidepanel__display-controls select { min-width:0; width:100%; }
.slideshow-sidepanel__summary-row { display:flex; align-items:center; gap:6px; min-width:0; }
.slideshow-sidepanel__summary { flex:1 1 auto; min-width:0; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sidepanel__thumbnail-size-control { flex:0 1 180px; min-width:100px; max-width:240px; display:flex; align-items:center; }
.slideshow-sidepanel__thumbnail-size-control input { width:100%; min-width:0; margin:0; }
.slideshow-sidepanel__presentation-settings { flex:0 0 auto; width:28px; height:28px; min-width:28px; padding:5px; }
.slideshow-sidepanel__path-actions { display:flex; flex-wrap:wrap; gap:8px; }
.slideshow-sidepanel__path-actions button { display:inline-flex; align-items:center; gap:6px; }
.slideshow-sorter { display:flex; flex-direction:column; gap:8px; min-height:0; overflow:auto; padding-right:2px; align-items:flex-start; }
.slideshow-sorter__row { position:relative; display:flex; flex-direction:column; gap:7px; width:100%; box-sizing:border-box; border:1px solid var(--background-modifier-border); border-radius:8px; padding:8px; background:var(--background-primary); outline:none; transition:margin .1s ease; }
.slideshow-sorter__row:focus, .slideshow-sorter__row.is-selected { border-color:var(--interactive-accent); box-shadow:0 0 0 1px var(--interactive-accent); }
.slideshow-sorter__row.is-excluded { opacity:.5; }
.slideshow-sorter__row.is-dragging { opacity:.35; }
.slideshow-sorter__row.is-drop-before { margin-top:22px; }
.slideshow-sorter__row.is-drop-after { margin-bottom:22px; }
.slideshow-sorter__row.is-drop-before::before, .slideshow-sorter__row.is-drop-after::after { content:""; position:absolute; left:8px; right:8px; border-top:2px dashed var(--interactive-accent); pointer-events:none; }
.slideshow-sorter__row.is-drop-before::before { top:-13px; }
.slideshow-sorter__row.is-drop-after::after { bottom:-13px; }
.slideshow-sorter__top { display:flex; flex-direction:column; gap:5px; align-items:stretch; padding:6px 8px; border-radius:6px; background:var(--background-secondary); }
.slideshow-sorter__top.is-draggable { cursor:grab; user-select:none; background-color:var(--background-secondary); background-image:radial-gradient(circle, var(--background-modifier-border-hover) .8px, transparent .9px); background-size:5px 5px; }
.slideshow-sorter__top.is-draggable:active { cursor:grabbing; }
.slideshow-sorter__title-row { display:flex; align-items:center; gap:5px; width:100%; min-width:0; }
.slideshow-sorter__title { flex:1 1 auto; min-width:0; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.35; }
.slideshow-sorter__title-edit { flex:0 0 auto; width:22px; height:22px; min-width:22px; padding:3px; display:flex; align-items:center; justify-content:center; }
.slideshow-sidepanel .slideshow-sorter__title-edit svg { width:14px; height:14px; }
.slideshow-sorter__badges { width:100%; min-width:0; display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sorter__badge { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; }
.slideshow-sorter__badge svg { width:14px; height:14px; }
.slideshow-sorter__badge-compact-count { display:none; }
.slideshow-sorter__content { display:flex; flex-direction:column; gap:6px; align-items:flex-start; min-width:0; }
.slideshow-sorter__preview { width:min(100%, var(--slideshow-sorter-thumbnail-max-width, 280px)); aspect-ratio:16/9; overflow:hidden; border-radius:5px; background:var(--background-secondary); display:flex; align-items:center; justify-content:center; }
.slideshow-sorter__preview svg { width:100%; height:100%; display:block; }
.slideshow-sorter__actions { display:flex; flex-wrap:wrap; gap:3px; align-items:center; }
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
  .slideshow-sidepanel__display-controls { grid-template-columns:1fr; }
  .slideshow-animation-editor__form { grid-template-columns:1fr; }
  .slideshow-animation-editor__step { grid-template-columns:1fr; }
  .slideshow-animation-editor__step-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; }
  .slideshow-sorter__actions { justify-content:flex-end; }
}

.slideshow-sorter:not(.has-expanded-editor) {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(160px,max(160px,var(--slideshow-sorter-thumbnail-max-width,280px))));
  align-content:start;
  align-items:stretch;
}
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row { width:100%; height:100%; box-sizing:border-box; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__top { min-height:0; box-sizing:border-box; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badges { min-height:18px; flex-wrap:nowrap; overflow:hidden; align-items:center; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge { flex:0 0 auto; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge-text { display:none; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge-compact-count { display:inline; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__content { flex:1 1 auto; justify-content:space-between; align-items:center; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__preview { width:min(100%,var(--slideshow-sorter-thumbnail-max-width,280px)); margin-inline:auto; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__actions { width:100%; justify-content:center; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__actions button { width:26px; height:26px; padding:4px; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__actions svg { width:15px; height:15px; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row.is-drop-before,
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row.is-drop-after { margin:0; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row.is-drop-before::before,
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row.is-drop-after::after { top:8px; bottom:8px; width:0; border-top:0; border-left:2px dashed var(--interactive-accent); }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row.is-drop-before::before { left:-6px; right:auto; }
.slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row.is-drop-after::after { right:-6px; left:auto; }
.slideshow-sorter.has-expanded-editor .slideshow-sorter__row { width:min(100%,820px); box-sizing:border-box; }

@container slideshow-panel (max-width: 300px) {
  .slideshow-sorter:not(.has-expanded-editor) { display:flex; }
  .slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__row { width:100%; height:auto; }
  .slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__top { min-height:0; }
  .slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badges { min-height:0; flex-wrap:wrap; overflow:visible; }
  .slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge-text { display:inline; }
  .slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge-compact-count { display:none; }
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
.slideshow-presenter__header-actions { display:flex; gap:6px; flex:0 0 auto; }
.slideshow-presenter__font-size-control { display:none; align-items:center; gap:6px; color:var(--text-muted); font-size:var(--font-ui-smaller); white-space:nowrap; }
.slideshow-presenter__font-size-control input { width:120px; }
.slideshow-presenter__close, .slideshow-presenter__layout-toggle { flex:0 0 auto; width:38px; height:38px; display:flex; align-items:center; justify-content:center; }
.slideshow-presenter__layout-toggle.is-active { color:var(--interactive-accent); background:var(--background-modifier-hover); }
.slideshow-presenter__grid { display:grid; flex:1 1 auto; grid-template-columns:minmax(220px,.8fr) minmax(300px,1.2fr); grid-template-rows:auto minmax(160px,1fr); grid-template-areas:"current next" "notes next"; gap:16px; align-items:stretch; min-height:0; }
.slideshow-presenter__column { min-width:0; display:flex; flex-direction:column; gap:9px; }
.slideshow-presenter__column:nth-child(1) { grid-area:current; }
.slideshow-presenter__column:nth-child(2) { grid-area:next; }
.slideshow-presenter__notes-column { grid-area:notes; min-height:0; height:100%; }
.slideshow-presenter__section-title { color:var(--text-muted); font-size:var(--font-ui-smaller); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.slideshow-presenter__preview { width:100%; overflow:hidden; border-radius:8px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); display:flex; align-items:center; justify-content:center; }
.slideshow-presenter__preview svg { width:100%; height:100%; display:block; }
.slideshow-presenter__current-preview { max-width:520px; }
.slideshow-presenter__next-preview { width:100%; }
.slideshow-presenter__end { display:flex; align-items:center; justify-content:center; min-height:180px; color:var(--text-muted); font-size:var(--font-ui-medium); border:1px dashed var(--background-modifier-border); border-radius:8px; }
.slideshow-presenter__notes { flex:1 1 auto; min-height:120px; padding:12px; border-radius:8px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); overflow-wrap:anywhere; overflow:auto; }
.slideshow-presenter__notes.is-empty { color:var(--text-muted); font-style:italic; }
.slideshow-presenter__progress { display:flex; align-items:center; gap:8px; color:var(--text-muted); font-size:var(--font-ui-small); }
.slideshow-presenter__controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:auto; padding-top:4px; }
.slideshow-presenter__controls button { min-width:44px; min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
.slideshow-presenter__controls svg, .slideshow-presenter__close svg, .slideshow-presenter__layout-toggle svg { width:18px; height:18px; }
.slideshow-presenter.is-notes-focused { overflow:hidden; }
.slideshow-presenter.is-notes-focused .slideshow-presenter__grid { flex:1; grid-template-columns:minmax(0,17fr) minmax(150px,3fr); grid-template-rows:minmax(0,1fr) minmax(0,1fr); grid-template-areas:"notes current" "notes next"; align-items:stretch; }
.slideshow-presenter.is-notes-focused .slideshow-presenter__notes-column { min-height:0; }
.slideshow-presenter.is-notes-focused .slideshow-presenter__font-size-control { display:flex; }
.slideshow-presenter.is-notes-focused .slideshow-presenter__notes { flex:1; min-height:0; font-size:var(--slideshow-presenter-notes-font-size, 18px); }
.slideshow-presenter.is-notes-focused .slideshow-presenter__current-preview { max-width:none; }
.slideshow-presenter.is-notes-focused .slideshow-presenter__column:nth-child(1), .slideshow-presenter.is-notes-focused .slideshow-presenter__column:nth-child(2) { min-height:0; overflow:hidden; }
@media (max-width: 700px) {
  .slideshow-presenter__grid, .slideshow-presenter.is-notes-focused .slideshow-presenter__grid { flex:none; grid-template-columns:1fr; grid-template-rows:auto; grid-template-areas:"current" "next" "notes"; }
  .slideshow-presenter__current-preview { max-width:none; }
  .slideshow-presenter.is-notes-focused { overflow:auto; }
}
`;
