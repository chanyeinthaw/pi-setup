import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { AgentSessionDriver } from "../../src/daemon/session-driver.ts";

export const layer = Layer.effect(
  AgentSessionDriver,
  Effect.succeed(
    AgentSessionDriver.of({
      start: (request) =>
        Effect.gen(function* () {
          const queue = yield* Queue.unbounded<any, Cause.Done>();
          yield* Effect.addFinalizer(() => Effect.sync(() => Queue.endUnsafe(queue)));
          Queue.offerUnsafe(queue, { _tag: "Message", role: "user", text: request.prompt });
          yield* Effect.forkScoped(
            Effect.sync(() => {
              Queue.offerUnsafe(queue, {
                _tag: "Message",
                role: "assistant",
                text: `Completed: ${request.prompt}`,
              });
              Queue.offerUnsafe(queue, {
                _tag: "Settled",
                status: "done",
                finalText: `Completed: ${request.prompt}`,
              });
              Queue.endUnsafe(queue);
            }),
          );
          return {
            sessionId: `session-${request.id}`,
            sessionFile: `${request.cwd}/${request.id}.jsonl`,
            events: Stream.fromQueue(queue),
            send: (text: string) =>
              Effect.sync(() => {
                Queue.offerUnsafe(queue, { _tag: "Message", role: "user", text });
              }),
            stop: Effect.sync(() => {
              Queue.offerUnsafe(queue, {
                _tag: "Settled",
                status: "cancelled",
                errorText: "Cancelled",
              });
              Queue.endUnsafe(queue);
            }),
          };
        }),
    }),
  ),
);
