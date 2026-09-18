/**
 * @file en.ts
 * @overview English source strings for Excalidraw Logo Turtle.
 */

export const en = {
  sidepanelTitle: "Logo Turtle",
  requiresNewerVersion: "Logo Turtle requires Excalidraw 2.27.0 or newer.",
  heading: "Excalidraw Logo Turtle",
  tagline: "Teach the turtle. Watch it draw. Keep the code with the picture.",
  scriptName: "Script name",
  scriptNamePlaceholder: "My turtle drawing",
  example: "Example",
  loadExample: "Load",
  editorLabel: "Logo program",
  editorHint: "Cmd/Ctrl+Enter to run · semicolon starts a comment",
  run: "Run",
  stop: "Stop",
  validate: "Validate",
  info: "Logo Turtle help",
  animation: "Animation",
  instant: "Instant",
  animationMs: "{value} ms/step",
  ready: "Ready. Give the turtle something fun to draw.",
  noView: "Focus an Excalidraw drawing to run this program.",
  validating: "Checking Logo…",
  valid: "Looks good: {commands} commands, {operations} drawing operations.",
  drawing: "Turtle is drawing…",
  stopped: "Drawing stopped.",
  done: "Done: {commands} Logo commands created {elements} Excalidraw elements.",
  parseError: "Logo error: {message}",
  renderError: "Could not draw: {message}",
  outputTitle: "Logo output",
  outputEmpty: "PRINT and SHOW output will appear here.",
  selectedScript: "Selected drawing contains Logo source: {name}",
  loadSelected: "Load selected",
  loadedSelected: "Loaded Logo source from the selected frame.",
  unsavedSelectionHint: "Select a Logo Turtle frame to reload its saved program.",
  infoTitle: "Logo Turtle quick guide",
  infoIntro:
    "This script implements a practical Turtle Logo dialect for drawing directly into Excalidraw. Logo has many dialects; the list below is the complete feature set supported here.",
  infoBasicsTitle: "Turtle movement",
  infoBasics:
    "FORWARD/FD, BACK/BK/BACKWARD, RIGHT/RT, LEFT/LT, HOME, SETXY, SETPOS/SETPOSITION, SETX, SETY, SETHEADING/SETH.",
  infoPenTitle: "Pen, fill, labels & turtle",
  infoPen:
    "PENUP/PU, PENDOWN/PD, SETPENCOLOR/SETPC/SETCOLOR, SETPENSIZE/SETPW/SETWIDTH/SETPENWIDTH, SETFILLCOLOR, BEGINFILL/ENDFILL, SETFONTSIZE, LABEL, SHOWTURTLE/ST, HIDETURTLE/HT.",
  infoControlTitle: "Control flow",
  infoControl:
    "REPEAT, FOR, WHILE, IF, IFELSE, RUN, WAIT, STOP, CLEAN, and CLEARSCREEN/CS. REPCOUNT reports the current loop iteration; TRUE and FALSE are boolean values.",
  infoProceduresTitle: "Procedures & variables",
  infoProcedures:
    "Define procedures with TO name :parameter … END. Procedures support parameters, recursion, OUTPUT/OP, MAKE assignments, LOCALMAKE for local values, and :name variable references.",
  infoMathTitle: "Expressions & reporters",
  infoMath:
    "Numbers, parentheses, + - * / % ^, = <> != < > <= >=, AND/OR/NOT; RANDOM, SQRT, ABS, ROUND, INT, SIN, COS, TAN, ARCTAN, POWER, MODULO, REMAINDER, MIN, MAX, SUM, DIFFERENCE, PRODUCT, QUOTIENT, PI, HEADING, XCOR, YCOR, POS, PENCOLOR, PENSIZE, SHOWNP, PENDOWNP, TOWARDS, DISTANCE, THING, WORD, SENTENCE/SE, FIRST, LAST, COUNT, and IFELSEVALUE.",
  infoConsoleTitle: "Console & comments",
  infoConsole:
    "PRINT/PR and SHOW write to the panel output area. Semicolon comments run to the end of the line.",
  infoCanvasTitle: "Excalidraw behavior",
  infoCanvas:
    "Each run animates a green triangle turtle on the current canvas. The finished artwork gets a titled rectangle. The rectangle stores the script name and complete Logo source in customData.excalidrawLogoTurtle, so selecting it later lets you reload the program.",
  infoSafetyTitle: "Safety limits",
  infoSafety:
    "Programs are limited to 25,000 executed commands and 64 procedure recursion levels. Infinite WHILE loops are stopped by the same safety budget.",
  infoDifferencesTitle: "Dialect notes",
  infoDifferences:
    "This is a Turtle-focused Logo dialect, not a complete Berkeley Logo runtime. File I/O, property lists, multiple turtles, workspace introspection, macros, and operating-system primitives are intentionally not implemented.",
  infoExampleTitle: "Tiny example",
  infoExample: "repeat 5 [ fd 100 rt 144 ]",
  infoLinksTitle: "Explore Logo",
  linkBerkeley: "Berkeley Logo 6.1 User Manual",
  linkTurtleAcademy: "Turtle Academy interactive lessons",
  linkLogoFoundation: "Logo Foundation: A Language for All Ages",
  exampleRainbow: "Rainbow spiral",
  exampleTree: "Recursive tree",
  exampleFlower: "Flower",
  exampleStars: "Star field",
  exampleSierpinski: "Sierpinski triangle",
} as const;

export type LogoTurtleTranslationKey = keyof typeof en;
