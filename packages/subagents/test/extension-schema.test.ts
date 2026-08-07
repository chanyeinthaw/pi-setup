import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "../src/extension/index.ts";

describe("subagents extension schema", () => {
  it.effect("registers a top-level object schema accepted by strict providers", () =>
    Effect.sync(() => {
      let tool: any;
      extension({
        on: () => undefined,
        registerTool: (value: unknown) => {
          tool = value;
        },
      } as any);
      assert.strictEqual(tool.name, "subagents");
      assert.strictEqual(tool.label, "Subagents");
      assert.strictEqual(tool.parameters.type, "object");
      assert.ok(tool.parameters.properties.action);
    }),
  );

  it.effect("does not block session startup while the daemon is unavailable", () =>
    Effect.promise(async () => {
      let sessionStart: ((event: unknown, ctx: ExtensionContext) => unknown) | undefined;
      extension({
        on: (event: string, handler: unknown) => {
          if (event === "session_start") {
            sessionStart = handler as (event: unknown, ctx: ExtensionContext) => unknown;
          }
        },
        registerTool: () => undefined,
      } as any);

      assert.ok(sessionStart);
      const startedAt = performance.now();
      const result = sessionStart({}, {
        sessionManager: {
          getSessionId: () => "parent",
        },
      } as ExtensionContext);
      assert.strictEqual(result, undefined);
      assert.ok(performance.now() - startedAt < 100);
    }),
  );
});
