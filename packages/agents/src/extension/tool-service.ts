import * as Effect from "effect/Effect";
import { discoverCapabilities, parseExecution } from "../shared/capabilities.ts";
import type { AgentClient } from "../shared/client.ts";

interface ToolContext {
  readonly cwd: string;
  readonly parentSessionId?: string;
  readonly parentSessionFile?: string;
}
export type AgentToolInput =
  | { readonly action: "discover"; readonly query?: string }
  | {
      readonly action: "execute";
      readonly capability: string;
      readonly arguments?: Record<string, unknown>;
    };
const methods = {
  "agent.start": "agent.start",
  "agent.find": "agent.list",
  "agent.status": "agent.get",
  "agent.send": "agent.send",
  "agent.stop": "agent.cancel",
  "agent.wait": "agent.wait",
} as const;
export const executeAgentTool = (
  client: AgentClient,
  input: AgentToolInput,
  context: ToolContext,
) =>
  Effect.gen(function* () {
    if (input.action === "discover") {
      const capabilities = discoverCapabilities(input.query);
      return {
        text:
          capabilities
            .map(
              (c) =>
                `${c.name}\n  ${c.description}${c.input ? `\nInput: ${JSON.stringify(c.input)}\nRequired: ${(c.required ?? []).join(", ") || "none"}` : ""}`,
            )
            .join("\n\n") || "No matching agent capabilities.",
        details: { capabilities },
      };
    }
    const execution = parseExecution(input.capability, input.arguments ?? {});
    let params: Record<string, unknown> = { ...execution.arguments };
    if (execution.capability === "agent.start")
      params = {
        ...params,
        cwd: params.cwd ?? context.cwd,
        parentSessionId: context.parentSessionId,
        parentSessionFile: context.parentSessionFile,
      };
    else if (execution.capability === "agent.find") {
      const scope = params.scope ?? "session";
      delete params.scope;
      if (scope === "session") params.parentSessionId = context.parentSessionId;
      else if (scope === "project") params.cwd = context.cwd;
    } else if (execution.capability === "agent.status") params.transcript ??= "recent";
    else if (execution.capability === "agent.wait")
      params = { agent: params.agent, parentSessionId: context.parentSessionId };
    const result = yield* client.call(methods[execution.capability], params);
    return { text: format(execution.capability, result), details: result };
  });
function format(capability: string, result: any) {
  if (capability === "agent.start")
    return `Started background agent "${result.agent.slug}".\n\nStatus: ${result.agent.status}\nWorking directory: ${result.agent.cwd}\n\nThe result will be delivered automatically. Continue with other useful work.`;
  if (capability === "agent.find")
    return result.agents.length === 0
      ? "No matching agents."
      : result.agents.map((a: any) => `${a.slug} [${a.status}] ${a.cwd}`).join("\n");
  if (capability === "agent.status")
    return `${result.agent.slug} [${result.agent.status}]\n${result.transcript ?? ""}`.trim();
  if (capability === "agent.send") return `Sent message to "${result.agent.slug}".`;
  if (capability === "agent.stop")
    return `Stopped "${result.agent.slug}" (${result.agent.status}).`;
  return `${result.agent.slug} [${result.agent.status}]\n${result.agent.finalText ?? result.agent.errorText ?? "(no output)"}`;
}
