/**
 * @file types.ts
 * @overview Shared types for the Logo interpreter, renderer, and sidepanel.
 */

export interface LogoPoint {
  x: number;
  y: number;
}

export interface LogoPenStyle {
  color: string;
  width: number;
  fillColor: string;
}

export interface LogoMoveOperation {
  type: "move";
  from: LogoPoint;
  to: LogoPoint;
  heading: number;
  draw: boolean;
  style: LogoPenStyle;
}

export interface LogoTurnOperation {
  type: "turn";
  at: LogoPoint;
  fromHeading: number;
  toHeading: number;
  visible: boolean;
}

export interface LogoVisibilityOperation {
  type: "visibility";
  at: LogoPoint;
  heading: number;
  visible: boolean;
}

export interface LogoWaitOperation {
  type: "wait";
  milliseconds: number;
}

export interface LogoLabelOperation {
  type: "label";
  at: LogoPoint;
  text: string;
  heading: number;
  color: string;
  fontSize: number;
}

export interface LogoFillOperation {
  type: "fill";
  points: LogoPoint[];
  style: LogoPenStyle;
}

export type LogoOperation =
  | LogoMoveOperation
  | LogoTurnOperation
  | LogoVisibilityOperation
  | LogoWaitOperation
  | LogoLabelOperation
  | LogoFillOperation;

export interface LogoProgramResult {
  operations: LogoOperation[];
  output: string[];
  commandCount: number;
}

export interface LogoSourceLocation {
  line: number;
  column: number;
}

export interface LogoStoredScript {
  version: 1;
  name: string;
  source: string;
  createdAt: string;
}

export interface LogoEditorState {
  name: string;
  source: string;
  animationDelayMs: number;
}

export interface LogoRunSummary {
  frameId: string;
  elementIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
}
