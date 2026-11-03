# Printable Layout Wizard

Export Excalidraw drawings as printable PDF pages. Define page areas with marker frames, add matching pages in any direction, rotate the next page, and choose page size, orientation, margins, locking, zoom, and empty-page handling.

In **Printing → Pages**, leave the field blank to print all pages or enter a selection such as `1, 3-5, 9-`. This prints page 1, pages 3 through 5, and page 9 through the end. Commas and semicolons separate ranges. Pages retain alphabetical frame order; overlapping ranges print each page once. The dialog lists each page number and frame name. Numbers refer to this list **before** empty pages are skipped, and only include marker frames when that option is enabled. A range beyond the end selects no pages; an invalid range displays an error without exporting.

Frames define print areas; content outside them is excluded. Frame borders and titles do not print. Keep frames the same size and orientation for a uniform PDF. Custom frames retain their size. Existing script preferences are preserved; page selection resets when you close the dialog.

Requires Excalidraw 2.27.0 or newer. PDF export uses the plugin's existing PDF service (Excalidraw Extras on desktop).

[Modular source and authoring instructions](https://github.com/zsviczian/ea-scripts/tree/main/src/scripts/printable-layout-wizard)

![Marker Frames](https://youtu.be/DqDnzCOoYMc)

![Printable Layout Wizard](https://youtu.be/29EWeglRm7s)

![](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-layout-wizard-01.png)

![](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-layout-wizard-02.png)

If you find this script helpful, consider [buying me a coffee](https://ko-fi.com/zsolt).
