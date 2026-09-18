# Excalidraw Logo Turtle

A persistent Excalidraw sidepanel for writing Turtle Logo and watching a triangle turtle draw the program directly on the canvas.

## What it does

- Full sidepanel authoring workflow with a syntax-highlighted Logo editor.
- `Cmd/Ctrl+Enter` runs the current program.
- Animated turtle with configurable animation speed and a Stop button.
- Built-in examples: rainbow spiral, recursive tree, filled flower, star field, and Sierpinski triangle.
- Procedures with parameters and recursion, variables, arithmetic/reporters, loops, conditionals, pen control, fills, labels, and common Logo aliases.
- Validation and a small `PRINT` / `SHOW` output console.
- Every finished drawing is wrapped in a titled rectangle.
- The rectangle stores `{ name, source, version, createdAt }` under `customData.excalidrawLogoTurtle`.
- Selecting a generated rectangle exposes **Load selected** in the sidepanel, so the original source can be edited and run again.
- The info button documents the complete supported dialect and links to Logo learning resources.

## Supported dialect

Movement: `FORWARD/FD`, `BACK/BK/BACKWARD`, `RIGHT/RT`, `LEFT/LT`, `HOME`, `SETXY`, `SETPOS/SETPOSITION`, `SETX`, `SETY`, `SETHEADING/SETH`.

Pen and drawing: `PENUP/PU`, `PENDOWN/PD`, `SETPENCOLOR/SETPC/SETCOLOR`, `SETPENSIZE/SETPW/SETWIDTH/SETPENWIDTH`, `SETFILLCOLOR`, `BEGINFILL/ENDFILL`, `SETFONTSIZE`, `LABEL`, `SHOWTURTLE/ST`, `HIDETURTLE/HT`.

Control flow and canvas reset: `REPEAT`, `FOR`, `WHILE`, `IF`, `IFELSE`, `RUN`, `WAIT`, `STOP`, `CLEAN`, `CLEARSCREEN/CS`, with `REPCOUNT` and boolean `TRUE` / `FALSE`.

Procedures and state: `TO ... END`, parameters, recursion, `OUTPUT/OP`, `MAKE`, `LOCALMAKE`, and `:name` variable references.

Expressions/reporters include arithmetic and comparison operators, boolean operators, `RANDOM`, trigonometry, numeric helpers, `PI`, turtle coordinates/heading, basic word/list reporters, and `IFELSEVALUE`.

The runtime intentionally focuses on turtle graphics. It does not attempt to implement Berkeley Logo file I/O, property lists, macros, multiple turtles, or operating-system primitives.
