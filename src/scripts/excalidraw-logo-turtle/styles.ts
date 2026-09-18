/**
 * @file styles.ts
 * @overview Scoped CSS for the Logo Turtle sidepanel and help modal.
 */

export const LOGO_TURTLE_STYLES = `
.logo-turtle-panel { container-type:inline-size; container-name:logo-turtle; display:flex; flex-direction:column; gap:10px; min-height:100%; box-sizing:border-box; padding:10px; color:var(--text-normal); }
.logo-turtle-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding-bottom:10px; border-bottom:1px solid var(--background-modifier-border); }
.logo-turtle-brand { min-width:0; display:flex; align-items:center; gap:9px; }
.logo-turtle-brand__icon { flex:0 0 auto; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:9px; background:var(--background-modifier-hover); color:var(--interactive-accent); }
.logo-turtle-brand__icon svg { width:19px; height:19px; }
.logo-turtle-heading { min-width:0; }
.logo-turtle-heading h2 { margin:0; font-size:var(--font-ui-medium); line-height:1.2; }
.logo-turtle-tagline { margin-top:3px; color:var(--text-muted); font-size:var(--font-ui-smaller); line-height:1.35; }
.logo-turtle-icon-button { flex:0 0 auto; width:32px; height:32px; padding:6px; display:inline-flex; align-items:center; justify-content:center; }
.logo-turtle-icon-button svg { width:17px; height:17px; }
.logo-turtle-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(110px,.65fr); gap:8px; align-items:end; }
.logo-turtle-field { display:flex; flex-direction:column; gap:5px; min-width:0; }
.logo-turtle-field label, .logo-turtle-section-label { font-size:var(--font-ui-smaller); color:var(--text-muted); font-weight:600; }
.logo-turtle-field input, .logo-turtle-field select { width:100%; box-sizing:border-box; }
.logo-turtle-example-row { display:flex; gap:6px; }
.logo-turtle-example-row select { flex:1 1 auto; min-width:0; }
.logo-turtle-example-row button { flex:0 0 auto; }
.logo-turtle-selection { display:none; align-items:center; justify-content:space-between; gap:8px; padding:8px 9px; border-radius:7px; background:var(--background-secondary); border:1px solid var(--background-modifier-border); }
.logo-turtle-selection.is-visible { display:flex; }
.logo-turtle-selection__text { min-width:0; color:var(--text-muted); font-size:var(--font-ui-smaller); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.logo-turtle-editor-heading { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.logo-turtle-editor-hint { color:var(--text-faint); font-size:var(--font-ui-smaller); text-align:right; }
.logo-turtle-editor { position:relative; height:360px; min-height:220px; resize:vertical; overflow:hidden; border:1px solid var(--background-modifier-border); border-radius:8px; background:var(--code-background); box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
.logo-turtle-editor:focus-within { border-color:var(--interactive-accent); box-shadow:0 0 0 1px var(--interactive-accent); }
.logo-turtle-highlight, .logo-turtle-textarea { position:absolute; inset:0; width:100%; height:100%; box-sizing:border-box; margin:0; padding:12px; border:0; border-radius:8px; font-family:var(--font-monospace); font-size:13px; line-height:1.55; tab-size:2; white-space:pre; overflow:auto; }
.logo-turtle-highlight { pointer-events:none; color:var(--text-normal); background:transparent; }
.logo-turtle-textarea { resize:none; background:transparent !important; color:transparent !important; -webkit-text-fill-color:transparent; caret-color:var(--text-normal); outline:none !important; box-shadow:none !important; }
.logo-turtle-textarea::selection { background:var(--text-selection); }
.logo-turtle-token--comment { color:var(--text-faint); font-style:italic; }
.logo-turtle-token--keyword { color:var(--color-purple); font-weight:600; }
.logo-turtle-token--command { color:var(--color-blue); }
.logo-turtle-token--reporter { color:var(--color-cyan); }
.logo-turtle-token--number { color:var(--color-orange); }
.logo-turtle-token--variable { color:var(--color-green); }
.logo-turtle-token--word { color:var(--color-yellow); }
.logo-turtle-token--symbol { color:var(--text-muted); }
.logo-turtle-controls { display:flex; flex-wrap:wrap; align-items:center; gap:7px; padding-top:2px; }
.logo-turtle-run { min-width:92px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
.logo-turtle-run svg { width:16px; height:16px; }
.logo-turtle-validate { display:inline-flex; align-items:center; gap:6px; }
.logo-turtle-validate svg { width:15px; height:15px; }
.logo-turtle-speed { margin-left:auto; display:flex; align-items:center; gap:7px; color:var(--text-muted); font-size:var(--font-ui-smaller); }
.logo-turtle-speed input { width:95px; }
.logo-turtle-status { min-height:34px; display:flex; align-items:flex-start; gap:7px; padding:8px 9px; border-radius:7px; background:var(--background-secondary); color:var(--text-muted); font-size:var(--font-ui-smaller); line-height:1.35; }
.logo-turtle-status.is-error { color:var(--text-error); background:var(--background-modifier-error-hover); }
.logo-turtle-status.is-success { color:var(--text-success); }
.logo-turtle-output { border:1px solid var(--background-modifier-border); border-radius:7px; overflow:hidden; }
.logo-turtle-output summary { padding:7px 9px; cursor:pointer; color:var(--text-muted); font-size:var(--font-ui-smaller); user-select:none; }
.logo-turtle-output pre { margin:0; padding:8px 10px; max-height:130px; overflow:auto; border-top:1px solid var(--background-modifier-border); background:var(--code-background); color:var(--text-muted); font-family:var(--font-monospace); font-size:12px; white-space:pre-wrap; }
.logo-turtle-help h3 { margin:18px 0 6px; font-size:var(--font-ui-medium); }
.logo-turtle-help p { margin:6px 0; line-height:1.45; }
.logo-turtle-help code { font-family:var(--font-monospace); }
.logo-turtle-help__example { padding:10px; border-radius:7px; background:var(--code-background); font-family:var(--font-monospace); }
.logo-turtle-help__links { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
.logo-turtle-help__links a { color:var(--link-color); }
@container logo-turtle (max-width:320px) {
  .logo-turtle-grid { grid-template-columns:1fr; }
  .logo-turtle-editor { height:300px; }
  .logo-turtle-speed { width:100%; margin-left:0; justify-content:space-between; }
}
`;
