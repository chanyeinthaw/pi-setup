import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  formatAssistantTranscript,
  formatToolTranscript,
  formatUserTranscript,
} from "../src/daemon/transcript-format.ts";

describe("native Pi transcript formatting", () => {
  it.effect("includes assistant thinking, text, and tool calls", () =>
    Effect.sync(() => {
      const text = formatAssistantTranscript({
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Plan the next step", thinkingSignature: "sig" },
          { type: "text", text: "I will inspect the files." },
          { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "sleep 10" } },
        ],
      } as any);
      assert.strictEqual(
        text,
        'THINKING\nPlan the next step\n\nI will inspect the files.\n\nTOOL CALL bash\n{"command":"sleep 10"}',
      );
    }),
  );

  it.effect("formats user and tool-result messages and omits empty assistants", () =>
    Effect.sync(() => {
      assert.strictEqual(
        formatUserTranscript({
          role: "user",
          content: [{ type: "text", text: "Inspect auth" }],
        } as any),
        "Inspect auth",
      );
      assert.strictEqual(
        formatToolTranscript({
          role: "toolResult",
          toolName: "bash",
          isError: false,
          content: [{ type: "text", text: "(no output)" }],
        } as any),
        "bash [success]\n(no output)",
      );
      assert.strictEqual(formatAssistantTranscript({ role: "assistant", content: [] } as any), "");
    }),
  );
});
