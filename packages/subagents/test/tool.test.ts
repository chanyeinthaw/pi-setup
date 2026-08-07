import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { AgentClient } from "../src/shared/client.ts";
import { executeSubagentsTool } from "../src/extension/tool-service.ts";
it.effect("subagents tool discovers locally and maps execution to daemon methods", () =>
  Effect.gen(function* () {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const client: AgentClient = {
      subscribe: () => Stream.empty,
      call: (method, params = {}) =>
        Effect.sync(() => {
          calls.push([method, params]);
          return { agent: { slug: "audit", status: "running", cwd: "/repo" } };
        }),
    };
    const discovery = yield* executeSubagentsTool(
      client,
      { action: "discover", query: "start" },
      { cwd: "/repo", parentSessionId: "parent" },
    );
    assert.match(discovery.text, /^start/m);
    assert.strictEqual(calls.length, 0);
    const execution = yield* executeSubagentsTool(
      client,
      {
        action: "execute",
        capability: "start",
        arguments: { name: "audit", prompt: "Inspect auth" },
      },
      { cwd: "/repo", parentSessionId: "parent" },
    );
    assert.match(execution.text, /Started background subagent "audit"/);
    assert.deepStrictEqual(calls[0], [
      "agent.start",
      {
        name: "audit",
        prompt: "Inspect auth",
        cwd: "/repo",
        parentSessionId: "parent",
        parentSessionFile: undefined,
      },
    ]);
  }),
);
