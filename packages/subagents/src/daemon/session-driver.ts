import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { AgentError, AgentStatus } from "../shared/domain.ts";

export interface StartSessionRequest {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly prompt: string;
  readonly cwd: string;
  readonly model?: string;
  readonly thinking?: string;
}

export type SessionEvent =
  | {
      readonly _tag: "Message";
      readonly role: "user" | "assistant" | "tool";
      readonly text: string;
    }
  | { readonly _tag: "Event"; readonly type: string; readonly payload: unknown }
  | {
      readonly _tag: "Settled";
      readonly status: Exclude<AgentStatus, "running" | "orphaned">;
      readonly finalText?: string;
      readonly errorText?: string;
    };

export interface AgentSessionHandle {
  readonly sessionId?: string;
  readonly sessionFile?: string;
  readonly events: import("effect/Stream").Stream<SessionEvent>;
  readonly send: (text: string) => Effect.Effect<void, AgentError>;
  readonly stop: Effect.Effect<void, AgentError>;
}

export interface AgentSessionDriverShape {
  readonly start: (
    request: StartSessionRequest,
  ) => Effect.Effect<AgentSessionHandle, AgentError, Scope.Scope>;
}

export class AgentSessionDriver extends Context.Service<
  AgentSessionDriver,
  AgentSessionDriverShape
>()("agents/AgentSessionDriver") {}
