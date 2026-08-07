import type { AssistantMessage, Message, Model, ToolResultMessage } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { join } from "node:path";
import { AgentError } from "../shared/domain.ts";
import { AgentSessionDriver } from "./session-driver.ts";
import {
  formatAssistantTranscript,
  formatToolTranscript,
  formatUserTranscript,
} from "./transcript-format.ts";

const make = Effect.succeed(
  AgentSessionDriver.of({
    start: (request) =>
      Effect.gen(function* () {
        const session = yield* Effect.tryPromise({
          try: async () => {
            const agentDir = getAgentDir();
            const settingsManager = SettingsManager.create(request.cwd, agentDir);
            const resourceLoader = new DefaultResourceLoader({
              cwd: request.cwd,
              agentDir,
              settingsManager,
            });
            await resourceLoader.reload();
            const registry = ModelRegistry.create(
              AuthStorage.create(join(agentDir, "auth.json")),
              join(agentDir, "models.json"),
            );
            const result = await createAgentSession({
              cwd: request.cwd,
              sessionManager: SessionManager.create(request.cwd),
              settingsManager,
              resourceLoader,
              modelRegistry: registry,
              model: resolveModel(registry, request.model),
              thinkingLevel: request.thinking as any,
              tools: ["read", "bash", "edit", "write"],
            });
            await result.session.bindExtensions({});
            result.session.sessionManager.appendSessionInfo(`agent: ${request.name}`);
            return result.session;
          },
          catch: (cause) =>
            new AgentError({ message: "Failed to create native Pi session.", cause }),
        });
        const queue = yield* Queue.unbounded<any, import("effect/Cause").Done>();
        let settled = false;
        const finalText = () => {
          for (let i = session.messages.length - 1; i >= 0; i--) {
            const m = session.messages[i] as Message;
            if (m.role !== "assistant") continue;
            const text = (m as AssistantMessage).content
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("\n")
              .trim();
            if (text) return text;
          }
          return "";
        };
        const unsubscribe = session.subscribe((event) => {
          Queue.offerUnsafe(queue, { _tag: "Event", type: event.type, payload: event });
          if (event.type === "message_end") {
            const message = event.message as Message;
            const formatted =
              message.role === "user"
                ? formatUserTranscript(message)
                : message.role === "assistant"
                  ? formatAssistantTranscript(message as AssistantMessage)
                  : message.role === "toolResult"
                    ? formatToolTranscript(message as ToolResultMessage)
                    : "";
            if (formatted) {
              Queue.offerUnsafe(queue, {
                _tag: "Message",
                role:
                  message.role === "user"
                    ? "user"
                    : message.role === "assistant"
                      ? "assistant"
                      : "tool",
                text: formatted,
              });
            }
          }
          if (event.type === "agent_end" && !settled) {
            settled = true;
            const last = [...session.messages]
              .reverse()
              .find((m) => (m as Message).role === "assistant") as AssistantMessage | undefined;
            Queue.offerUnsafe(
              queue,
              last?.stopReason === "error"
                ? {
                    _tag: "Settled",
                    status: "error",
                    errorText: last.errorMessage ?? "Agent failed",
                    finalText: finalText(),
                  }
                : {
                    _tag: "Settled",
                    status: last?.stopReason === "aborted" ? "cancelled" : "done",
                    finalText: finalText(),
                  },
            );
            Queue.endUnsafe(queue);
          }
        });
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            unsubscribe();
            session.clearQueue();
            await session.abort().catch(() => undefined);
            session.dispose();
            Queue.endUnsafe(queue);
          }),
        );
        void session.prompt(request.prompt).catch((cause) => {
          if (!settled) {
            settled = true;
            Queue.offerUnsafe(queue, {
              _tag: "Settled",
              status: "error",
              errorText: cause instanceof Error ? cause.message : String(cause),
              finalText: finalText(),
            });
            Queue.endUnsafe(queue);
          }
        });
        return {
          sessionId: session.sessionId,
          sessionFile: session.sessionFile,
          events: Stream.fromQueue(queue),
          send: (text: string) =>
            Effect.tryPromise({
              try: () => (session.isStreaming ? session.steer(text) : session.prompt(text)),
              catch: (cause) => new AgentError({ message: "Failed to send agent message.", cause }),
            }).pipe(Effect.asVoid),
          stop: Effect.tryPromise({
            try: () => session.abort(),
            catch: (cause) => new AgentError({ message: "Failed to stop agent.", cause }),
          }).pipe(Effect.asVoid),
        };
      }),
  }),
);
export const layer = Layer.effect(AgentSessionDriver, make);
function resolveModel(registry: ModelRegistry, hint?: string): Model<any> | undefined {
  if (!hint) return undefined;
  const slash = hint.indexOf("/");
  if (slash > 0) return registry.find(hint.slice(0, slash), hint.slice(slash + 1));
  const matches = registry.getAll().filter((model) => model.id === hint);
  if (matches.length === 1) return matches[0];
  throw new Error(
    matches.length > 1 ? `Model "${hint}" is ambiguous.` : `Unknown model "${hint}".`,
  );
}
