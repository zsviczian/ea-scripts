# Deconstruct Selected Elements Into New Drawing

![](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-deconstruct.jpg)

Select elements in the current Excalidraw scene. The script moves the selected elements into a new Excalidraw file, replaces the original selection with an embedded reference to that new drawing, and optionally opens the new file.

The modal lets you choose the destination folder, filename, template, whether to open the new drawing, whether to reuse an adjacent tab, and whether the inserted embed should be anchored at 100% size.

Destination names are validated before creation. Filenames reject path separators and characters that are invalid or unsafe across common vault platforms (`\\ / : * ? " < > |` and control characters). Folder paths use `/` only as the path separator and validate each folder name independently.

The script preserves backing data for file-backed images, hyperlinks, SVG bitmap metadata, image color maps, and rendered LaTeX equations when the selected elements are written into the new drawing.

## Usage

1. Select one or more elements in an Excalidraw drawing.
2. Run **Deconstruct Selected Elements Into New Drawing**.
3. Choose the destination folder, file name, and optional template.
4. Choose **Insert** or **Insert @100%**.

The default filename and additional template paths can be configured through the script settings.

## Original demonstrations

![](https://www.youtube.com/watch?v=HRtaaD34Zzg)

![](https://www.youtube.com/watch?v=mvMQcz401yo)
