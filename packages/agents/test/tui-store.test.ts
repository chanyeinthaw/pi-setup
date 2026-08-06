import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { createAgentStore } from "../src/tui/store.ts";
import type { AgentRecord } from "../src/shared/domain.ts";

const agent = (overrides: Partial<AgentRecord> = {}): AgentRecord => ({
  id: "a1",
  slug: "audit",
  name: "Audit",
  prompt: "Inspect auth",
  cwd: "/repo",
  status: "running",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("TUI store", () => {
  it.effect("folds snapshots and live transcript notifications", () =>
    Effect.sync(() => {
      const store = createAgentStore();
      store.apply({ type: "snapshot", agents: [agent()], transcripts: {} });
      store.apply({
        type: "transcript.appended",
        agentId: "a1",
        item: {
          sequence: 1,
          agentId: "a1",
          timestamp: 2,
          role: "assistant",
          text: "Found an issue",
        },
      });
      const snapshot = store.getSnapshot();
      assert.strictEqual(snapshot.selectedAgentId, "a1");
      assert.strictEqual(snapshot.transcripts.a1?.[0]?.text, "Found an issue");
    }),
  );

  it.effect("sorts running agents before settled agents", () =>
    Effect.sync(() => {
      const store = createAgentStore();
      store.apply({
        type: "snapshot",
        agents: [
          agent({ id: "done", slug: "done", status: "done", createdAt: 20 }),
          agent({ id: "run", slug: "run", status: "running", createdAt: 10 }),
        ],
        transcripts: {},
      });
      assert.deepEqual(
        store.getSnapshot().agents.map((item) => item.id),
        ["run", "done"],
      );
    }),
  );
});
