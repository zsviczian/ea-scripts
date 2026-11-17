/** Persisted task execution choices; normalized against the runtime enum tables. */
export interface TaskExecution {
  mode: string;
  resultType: string;
  userPrompt: string;
  imageInput: string;
  maskMode: string;
  requiresApi: string;
}

/** An editable ExcaliAI task with its existing stable serialized keys. */
export interface TaskConfig {
  id: string;
  name: string;
  help: string;
  systemPrompt: string | null;
  outputInstruction: string;
  execution: TaskExecution;
}
export type TaskConfigInput = Partial<Omit<TaskConfig, "execution">> & {
  execution?: Partial<TaskExecution>;
};
export interface TaskExecutionMeta {
  label: string;
  description: string;
}
export interface TaskResultMeta extends TaskExecutionMeta {
  runtimeRequirement?: string;
}
export interface ExcaliAIState {
  selectedTaskId: string;
  userPrompt: string;
  maskEdit: boolean;
  textModel: string;
  imageModel: string;
  maxTokens: string;
  imageSize: string;
}
export interface ExcaliAISettings {
  schemaVersion: number;
  config: { tasks: TaskConfig[] };
  state: ExcaliAIState;
}
/** Legacy top-level preferences remain accepted during the one-time conversion. */
export interface LegacyExcaliAISettings extends Record<string, unknown> {
  config?: { tasks?: TaskConfigInput[] };
  state?: Partial<ExcaliAIState>;
}
