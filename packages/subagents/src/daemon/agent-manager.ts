import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { resolve } from "node:path";
import type { AgentRecord } from "../shared/domain.ts";
import { AgentError } from "../shared/domain.ts";
import { AgentRegistry } from "./registry.ts";
import { AgentSessionDriver, type AgentSessionHandle } from "./session-driver.ts";

interface Entry {
  readonly scope: Scope.Closeable;
  readonly session: AgentSessionHandle;
  readonly pump: Fiber.Fiber<void, AgentError>;
}
export interface AgentManagerShape {
  readonly start: (params: any) => Effect.Effect<AgentRecord, AgentError>;
  readonly require: (ref: string) => Effect.Effect<AgentRecord, AgentError>;
  readonly send: (ref: string, message: string) => Effect.Effect<AgentRecord, AgentError>;
  readonly stop: (ref: string) => Effect.Effect<AgentRecord, AgentError>;
  readonly wait: (ref: string) => Effect.Effect<AgentRecord, AgentError>;
}
export class AgentManager extends Context.Service<AgentManager, AgentManagerShape>()(
  "agents/AgentManager",
) {}

const make = Effect.gen(function* () {
  const registry = yield* AgentRegistry;
  const driver = yield* AgentSessionDriver;
  const entries = new Map<string, Entry>();
  let reserved = 0;
  const requireAgent = (ref: string) =>
    registry
      .get(ref)
      .pipe(
        Effect.flatMap((agent) =>
          agent ? Effect.succeed(agent) : new AgentError({ message: `Unknown agent "${ref}".` }),
        ),
      );
  const close = (entry: Entry) => Scope.close(entry.scope, Exit.void).pipe(Effect.ignore);

  const start = (params: any) =>
    Effect.gen(function* () {
      const running = yield* registry.list({ status: "running" });
      if (running.length + reserved >= 4)
        return yield* new AgentError({ message: "Maximum of 4 running agents reached." });
      reserved++;
      return yield* Effect.gen(function* () {
        const id = crypto.randomUUID();
        const base = slugify(params.name) || "agent";
        let slug = base;
        let suffix = 2;
        while (yield* registry.get(slug)) slug = `${base}-${suffix++}`;
        const now = Date.now();
        const normalizedCwd = resolve(params.cwd);
        const record: AgentRecord = {
          id,
          slug,
          name: params.name,
          prompt: params.prompt,
          cwd: normalizedCwd,
          parentSessionId: params.parentSessionId,
          parentSessionFile: params.parentSessionFile,
          model: params.model,
          thinking: params.thinking,
          status: "running",
          createdAt: now,
          updatedAt: now,
        };
        yield* registry.insert(record);
        const scope = yield* Scope.make();
        const session = yield* Scope.provide(
          driver.start({
            id,
            slug,
            name: record.name,
            prompt: record.prompt,
            cwd: record.cwd,
            model: record.model,
            thinking: record.thinking,
          }),
          scope,
        ).pipe(
          Effect.tapError((error) =>
            registry.settle(id, "error", undefined, formatError(error)).pipe(Effect.ignore),
          ),
          Effect.onError(() => Scope.close(scope, Exit.void)),
        );
        yield* registry.attachSession(id, session.sessionId, session.sessionFile);
        const pumpEffect = Stream.runForEach(session.events, (event) => {
          if (event._tag === "Message") return registry.appendMessage(id, event.role, event.text);
          if (event._tag === "Event") return registry.appendEvent(id, event.type, event.payload);
          return registry.settle(id, event.status, event.finalText, event.errorText);
        }).pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              const a = yield* registry.get(id);
              if (a?.status === "running")
                yield* registry.settle(
                  id,
                  "error",
                  undefined,
                  "Session event stream ended unexpectedly",
                );
            }).pipe(Effect.ignore),
          ),
        );
        const pump = yield* Scope.provide(Effect.forkScoped(pumpEffect), scope);
        entries.set(id, { scope, session, pump });
        return yield* requireAgent(id);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            reserved--;
          }),
        ),
      );
    });

  yield* Effect.addFinalizer(() =>
    Effect.forEach([...entries.values()], close, { concurrency: "unbounded" }).pipe(Effect.asVoid),
  );
  return AgentManager.of({
    start,
    require: requireAgent,
    send: (ref, message) =>
      Effect.gen(function* () {
        const a = yield* requireAgent(ref);
        const e = entries.get(a.id);
        if (!e)
          return yield* new AgentError({
            message: `Agent "${a.slug}" is not attached to this daemon.`,
          });
        yield* e.session.send(message);
        return yield* requireAgent(a.id);
      }),
    stop: (ref) =>
      Effect.gen(function* () {
        const a = yield* requireAgent(ref);
        const e = entries.get(a.id);
        if (e) yield* e.session.stop;
        return yield* requireAgent(a.id);
      }),
    wait: (ref) =>
      Effect.gen(function* () {
        while (true) {
          const agent = yield* requireAgent(ref);
          if (agent.status !== "running") return agent;
          yield* Effect.sleep("100 millis");
        }
      }),
  });
});
export const layer = Layer.effect(AgentManager, make);
function formatError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause =
    "cause" in error ? (error as Error & { readonly cause?: unknown }).cause : undefined;
  if (!cause) return error.message;
  return `${error.message} ${cause instanceof Error ? cause.message : formatUnknown(cause)}`;
}

function formatUnknown(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Unknown cause";
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
