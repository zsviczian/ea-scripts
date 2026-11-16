# MVP verification

Run from the authoring repository with Node 22.22.3:

```sh
npx tsc --noEmit -p src/scripts/scientific-plotter/testing/tsconfig.json
npx eslint 'src/scripts/scientific-plotter/**/*.ts'
npx vitest run src/scripts/scientific-plotter/__tests__
npm run build
```

2026-11-16: focused typecheck passed; ESLint reported no errors (complexity/length warnings remain); 43 focused tests passed; workspace build passed.

`npm run check` stops on type errors in existing scripts. Running all tests independently produced 490 passing and 9 failing tests; failures are in the existing Canvas Chat and Slideshow suites. No existing script sources were changed for this MVP.

Native preparation was attempted through the plugin repository's `npm run test:native -- --prepare-only`, which built the selected fork, Extras, K-Plex and plugin. It could not reach a running Obsidian instance: “The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.” A direct CLI help retry returned the same error. No live script/UI behavior is claimed verified.

Remaining manual acceptance: open the repository-owned test vault, install this build through Script Engine, insert each starter, verify grouped editable output and undo/save/reopen, load/update a moved diagram, switch drawings and a non-drawing tab, restore the persistent panel without a drawing, test popout migration/teardown, and test phone/tablet touch on physical devices. Highest-probability integration failures are SVG/EA rendering differences and focus/close timing around a pending save.
