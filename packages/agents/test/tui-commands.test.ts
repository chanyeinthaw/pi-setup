import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { AgentClient } from "../src/shared/client.ts";
import { makeAgentCommands } from "../src/tui/commands.ts";
import { createAgentStore } from "../src/tui/store.ts";

const snapshot = {
  type: "snapshot" as const,
  agents: [
    {
      id: "a1",
      slug: "audit",
      name: "Audit",
      prompt: "Inspect auth",
      cwd: "/repo",
      status: "running" as const,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  transcripts: {},
};

describe("TUI commands", () => {
  it.effect("sends a message and clears pending state", () =>
    Effect.gen(function* () {
      const calls: Array<[string, Record<string, unknown>]> = [];
      const client: AgentClient = {
        subscribe: () => Stream.empty,
        call: (method, params = {}) =>
          Effect.sync(() => {
            calls.push([method, params]);
            return {};
          }),
      };
      const store = createAgentStore();
      store.apply(snapshot);
      yield* makeAgentCommands(client, store).send("Focus on rotation");
      assert.deepEqual(calls[0], ["agent.send", { agent: "a1", message: "Focus on rotation" }]);
      assert.strictEqual(store.getSnapshot().command.pending, false);
      assert.isUndefined(store.getSnapshot().command.error);
    }),
  );

  it.effect("shows command failures", () =>
    Effect.gen(function* () {
      const client: AgentClient = {
        subscribe: () => Stream.empty,
        call: () => Effect.fail(new Error("not attached") as any),
      };
      const store = createAgentStore();
      store.apply(snapshot);
      yield* makeAgentCommands(client, store).cancel.pipe(Effect.ignore);
      assert.strictEqual(store.getSnapshot().command.error, "not attached");
    }),
  );
});
