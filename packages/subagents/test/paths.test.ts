import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { subagentStatePaths } from "../src/shared/paths.ts";

describe("subagent state paths", () => {
  it.effect("uses the isolated subagents namespace", () =>
    Effect.sync(() => {
      assert.deepStrictEqual(subagentStatePaths("/tmp/pi"), {
        root: "/tmp/pi/subagents",
        socket: "/tmp/pi/subagents/daemon.sock",
        database: "/tmp/pi/subagents/subagents.db",
        log: "/tmp/pi/subagents/daemon.log",
      });
    }),
  );
});
