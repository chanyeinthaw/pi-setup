import type { ManagedRuntime } from "effect/ManagedRuntime";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { AgentClient } from "../shared/client.ts";
import type { AgentStore } from "./store.ts";

export const runSubscription = <R>(options: {
  readonly client: AgentClient;
  readonly store: AgentStore;
  readonly runtime: ManagedRuntime<R, never>;
  readonly cwd?: string;
}) => {
  let attempt = 0;
  return options.runtime.runFork(
    Effect.forever(
      Effect.gen(function* () {
        options.store.setConnection(attempt === 0 ? "connecting" : "disconnected");
        const params = options.cwd ? { cwd: options.cwd } : {};
        const result = yield* Stream.runForEach(options.client.subscribe(params), (message) =>
          Effect.sync(() => options.store.apply(message)),
        ).pipe(Effect.exit);
        if (result._tag === "Failure") {
          const delay = Math.min(5000, 250 * 2 ** attempt);
          attempt++;
          const cause = Cause.pretty(result.cause).split("\n")[0];
          options.store.setConnection("disconnected", `${cause} · retrying in ${delay}ms`);
          yield* Effect.sleep(`${delay} millis`);
        } else {
          attempt = 0;
        }
      }),
    ),
  );
};
