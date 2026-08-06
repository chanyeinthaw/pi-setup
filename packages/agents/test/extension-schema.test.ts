import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import extension from "../src/extension/index.ts";

describe("agent extension schema", () => {
  it.effect("registers a top-level object schema accepted by strict providers", () =>
    Effect.sync(() => {
      let tool: any;
      extension({
        on: () => undefined,
        registerTool: (value: unknown) => {
          tool = value;
        },
      } as any);
      assert.strictEqual(tool.parameters.type, "object");
      assert.ok(tool.parameters.properties.action);
    }),
  );
});
