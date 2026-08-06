import * as Data from "effect/Data";

export type AgentStatus = "running" | "done" | "error" | "cancelled" | "orphaned";

export interface AgentRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly parentSessionId?: string;
  readonly parentSessionFile?: string;
  readonly sessionId?: string;
  readonly sessionFile?: string;
  readonly model?: string;
  readonly thinking?: string;
  readonly status: AgentStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly settledAt?: number;
  readonly finalText?: string;
  readonly errorText?: string;
}

export interface DeliveryRecord {
  readonly id: string;
  readonly agentId: string;
  readonly parentSessionId: string;
  readonly slug: string;
  readonly status: AgentStatus;
  readonly finalText?: string;
  readonly errorText?: string;
  readonly sessionFile?: string;
  readonly createdAt: number;
}

export class AgentError extends Data.TaggedError("AgentError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ProtocolError extends Data.TaggedError("ProtocolError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
