import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Layer from "effect/Layer";
import { defaultClient } from "../shared/default-client.ts";
import { executeSubagentsTool } from "./tool-service.ts";

const runtime = ManagedRuntime.make(Layer.empty);
export default function (pi: ExtensionAPI) {
  let context: ExtensionContext | undefined;
  let deliveryFiber: Fiber.Fiber<void> | undefined;
  const flush = Effect.gen(function* () {
    const ctx = context;
    if (!ctx) return;
    const parentSessionId = ctx.sessionManager.getSessionId();
    const { deliveries } = yield* defaultClient.call("delivery.pending", { parentSessionId });
    for (const d of deliveries) {
      yield* Effect.sync(() => {
        pi.sendMessage(
          {
            customType: "agent-result",
            content: [
              `Background subagent "${d.slug}" ${d.status}.`,
              d.errorText ? `Error: ${d.errorText}` : "",
              d.finalText ?? "(no output)",
              `Open the subagents TUI to view the full transcript for ${d.slug}.`,
              d.sessionFile ? `Session: ${d.sessionFile}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            display: false,
            details: d,
          },
          { deliverAs: "steer", triggerTurn: true },
        );
        pi.appendEntry("agent-delivery", {
          deliveryId: d.id,
          agentId: d.agentId,
          deliveredAt: Date.now(),
        });
      });
      yield* defaultClient.call("delivery.ack", { deliveryId: d.id });
    }
  }).pipe(Effect.ignore);
  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    deliveryFiber = runtime.runFork(
      Effect.forever(flush.pipe(Effect.andThen(Effect.sleep("1 second")))),
    );
    runtime.runFork(flush);
  });
  pi.on("agent_end", () => runtime.runPromise(flush));
  pi.on("session_shutdown", async () => {
    context = undefined;
    if (deliveryFiber) await runtime.runPromise(Fiber.interrupt(deliveryFiber));
    deliveryFiber = undefined;
  });
  pi.registerTool({
    name: "subagents",
    label: "Subagents",
    description: "Discover and execute persistent background native Pi-subagent capabilities.",
    promptSnippet:
      "subagents — discover and execute persistent background Pi-subagent capabilities",
    promptGuidelines: [
      "Use subagent discovery before executing an unfamiliar subagent capability.",
      "Use start for self-contained work that can proceed independently.",
      "After start, continue other useful work instead of repeatedly polling; results are delivered automatically.",
      "Use wait only when the current task cannot proceed without one subagent's result.",
      "Subagents cannot start other subagents.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("discover"), Type.Literal("execute")]),
      query: Type.Optional(Type.String()),
      capability: Type.Optional(Type.String()),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    execute(_id, params, _signal, _update, ctx) {
      return executeSubagentsTool(defaultClient, params as any, {
        cwd: ctx.cwd,
        parentSessionId: ctx.sessionManager.getSessionId(),
        parentSessionFile: ctx.sessionManager.getSessionFile(),
      }).pipe(
        Effect.map((r) => ({
          content: [{ type: "text" as const, text: r.text }],
          details: r.details,
        })),
        runtime.runPromise,
      );
    },
  });
}
