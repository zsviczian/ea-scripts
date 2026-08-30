/**
 * @file styles.ts
 * @overview Scoped CSS for the slideshow sidepanel and sorter.
 */

export const SLIDESHOW_SIDEPANEL_STYLES = `
.slideshow-sidepanel { display:flex; flex-direction:column; gap:12px; padding:10px; height:100%; box-sizing:border-box; }
.slideshow-sidepanel__header { display:flex; gap:8px; align-items:center; }
.slideshow-sidepanel__header button { display:inline-flex; align-items:center; gap:6px; }
.slideshow-sidepanel__summary { color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sorter { display:flex; flex-direction:column; gap:8px; min-height:0; overflow:auto; padding-right:2px; }
.slideshow-sorter__row { display:grid; grid-template-columns:auto 104px minmax(0,1fr) auto; gap:8px; align-items:center; border:1px solid var(--background-modifier-border); border-radius:8px; padding:7px; background:var(--background-primary); outline:none; }
.slideshow-sorter__row:focus, .slideshow-sorter__row.is-selected { border-color:var(--interactive-accent); box-shadow:0 0 0 1px var(--interactive-accent); }
.slideshow-sorter__row.is-excluded { opacity:.5; }
.slideshow-sorter__row.is-dragging { opacity:.35; }
.slideshow-sorter__drag { cursor:grab; display:flex; align-items:center; }
.slideshow-sorter__preview { width:104px; aspect-ratio:16/9; overflow:hidden; border-radius:5px; background:var(--background-secondary); display:flex; align-items:center; justify-content:center; }
.slideshow-sorter__preview svg { width:100%; height:100%; display:block; }
.slideshow-sorter__body { min-width:0; display:flex; flex-direction:column; gap:5px; }
.slideshow-sorter__title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.slideshow-sorter__badges { display:flex; gap:5px; flex-wrap:wrap; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-sorter__badge { display:inline-flex; align-items:center; gap:3px; }
.slideshow-sorter__badge svg { width:14px; height:14px; }
.slideshow-sorter__actions { display:grid; grid-template-columns:repeat(2,30px); gap:3px; }
.slideshow-sorter__actions button, .slideshow-sorter__drag button { width:30px; height:30px; padding:5px; display:flex; align-items:center; justify-content:center; }
.slideshow-sorter__actions svg, .slideshow-sorter__drag svg { width:16px; height:16px; }
.slideshow-notes { border-top:1px solid var(--background-modifier-border); padding-top:10px; display:flex; flex-direction:column; gap:7px; }
.slideshow-notes textarea { width:100%; min-height:110px; resize:vertical; box-sizing:border-box; }
.slideshow-notes__hint, .slideshow-warning, .slideshow-empty { color:var(--text-muted); font-size:var(--font-ui-smaller); }
.slideshow-warning { padding:8px; border-radius:6px; background:var(--background-secondary); }
.slideshow-sidepanel button svg { width:16px; height:16px; }
`;
