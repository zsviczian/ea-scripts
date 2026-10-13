# Mind Map Builder: Technical Specification & User Guide

## Overview
**Mind Map Builder** transforms the Obsidian-Excalidraw canvas into a rapid brainstorming environment, allowing users to build complex, structured, and visually organized mind maps using primarily keyboard shortcuts.

The script balances **automation** (auto-layout, recursive grouping, and contrast-aware coloring) with **explicit flexibility** (node pinning and redirection logic), ensuring that the mind map stays organized even as it grows to hundreds of nodes. It leverages the Excalidraw Sidepanel API to provide a persistent control interface utilizing the Obsidian sidepanel, that can also be undocked into a floating modal.

## Technical notes

### Sidepanel & Docking
- **Persistent UI**: The script utilizes `ea.createSidepanelTab` to maintain state and controls alongside the drawing canvas.
- **Floating Mode**: The UI can be "undocked" (Shift+Enter) into a `FloatingModal` for a focus-mode experience or to move controls closer to the active drawing area on large screens.

### Map-Specific Persistence (customData)
The script uses `ea.addAppendUpdateCustomData` to store state on elements:
- `growthMode`: Stored on the Root node (Radial, Left, or Right).
- `autoLayoutDisabled`: Stored on the Root node to pause layout engine for specific maps (toggle from UI).
- `arrowType`, `fontsizeScale`, `multicolor`, `boxChildren`, `roundedCorners`, `maxWrapWidth`, `isSolidArrow`, `centerText`: Stored on the Root node to persist display preferences per map.
- `isPinned`: Stored on individual nodes (boolean) to bypass the layout engine.
- `isBranch`: Stored on arrows (boolean) to distinguish Mind Map connectors from standard annotations.
- `mindmapOrder`: Stored on nodes (number) to maintain manual sort order of siblings.
- `mindmapNew`: Stored on nodes (boolean) to tag freshly added items so new siblings append after existing order; cleared after layout.
- `isFolded`: Stored on nodes (boolean) to collapse a branch and hide its descendants.
- `foldIndicatorId`: Stored on nodes to track the ephemeral "…" indicator element that signals a folded branch.
- `foldState`: Stored on nodes and branch arrows to cache their opacity/lock state while hidden so it can be restored when unfolded.
- `boundaryId`: Stored on nodes to track the ID of the boundary element (a closed polygon line) that visually encompasses the node's subtree.
- `isBoundary`: Stored on the line polygon to mark it is a boundary for a node.

### The "mindmapNew" Tag & Order Stability
When a Level 1 node is created, it is temporarily tagged with `mindmapNew: true`. The layout engine uses this to separate "Existing" nodes from "New" nodes. Existing nodes are sorted by their `mindmapOrder` (or visual angle/Y-position if order is missing), while new nodes are appended to the end. This prevents new additions from scrambling the visual order of existing branches.

### Sidepanel Lifecycle Management
The script implements `SidepanelTab` hooks (`onFocus`, `onClose`, `onWindowMigrated`) to handle:
- **Context Switching**: Rebinding event listeners when the user switches between multiple Excalidraw views.
- **Window Migration**: Re-attaching keyboard handlers when the sidepanel moves between the main window and a popout window.
- **Auto-Docking**: Ensuring floating modals are docked back to the sidepanel when the view closes to prevent UI orphans.

### Recursive Grouping
When enabled, the script groups elements from the "leaves" upward. A leaf node is grouped with its parent and the connecting arrow. That group is then nested into the grandparent's group. The **Root Exception**: The root node is never part of an L1 group, allowing users to move the central idea or detach whole branches easily.

### Smart Decoration Scaling (Edge Anchoring)
When nodes resize (e.g. text edit), the script intelligently re-positions grouped elements:
- **Inside Elements**: Scale relative to the center (e.g. text inside a box).
- **Outside Elements**: Anchor to the nearest edge (e.g. icons above a node) to preserve visual gaps, preventing them from "flying away" during expansion.

### Copy/Paste & Cross-linking
- **Hierarchy**: Markdown lists are parsed into the mind map structure.
- **Cross-links**: The script preserves non-structural connections by generating internal block references (`^blockId`) and valid wikilinks (`[[#^blockId]]`) when copying branches to markdown.

### Link suggester keydown events (Enter, Escape)
- **Key-safe integration**: The suggester implements the `KeyBlocker` interface so the script's own key handlers pause while the suggester is active, preventing shortcut collisions during link insertion.
