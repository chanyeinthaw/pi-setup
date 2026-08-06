import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { discoverCapabilities, parseExecution } from "../src/shared/capabilities.ts";

describe("agent capabilities", () => {
  it.effect("discovers concise capabilities and expands a selected contract", () =>
    Effect.sync(() => {
      const all = discoverCapabilities();
      assert.deepStrictEqual(
        all.map((capability) => capability.name),
        ["agent.start", "agent.find", "agent.status", "agent.send", "agent.stop", "agent.wait"],
      );
      assert.strictEqual(all[0]?.input, undefined);
      const selected = discoverCapabilities("start background work");
      assert.strictEqual(selected.length, 1);
      assert.strictEqual(selected[0]?.name, "agent.start");
      assert.deepStrictEqual(selected[0]?.required, ["name", "prompt"]);
      assert.ok(selected[0]?.input);
    }),
  );

  it.effect("rejects unknown capabilities and missing arguments", () =>
    Effect.sync(() => {
      assert.throws(() => parseExecution("agent.unknown", {}), /Unknown agent capability/);
      assert.throws(() => parseExecution("agent.start", { name: "audit" }), /prompt/);
    }),
  );
});
