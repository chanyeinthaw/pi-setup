import * as Effect from "effect/Effect";
import type { AgentClient } from "../shared/client.ts";
import { ProtocolError } from "../shared/domain.ts";
import type { AgentStore } from "./store.ts";

export function makeAgentCommands(client: AgentClient, store: AgentStore) {
  const run = (method: string, params: Record<string, unknown>) =>
    Effect.gen(function* () {
      store.setCommand({ pending: true });
      yield* client.call(method, params);
      store.setCommand({ pending: false });
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() =>
          store.setCommand({
            pending: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ),
    );

  return {
    send: (message: string) => {
      const agent = selectedAgent(store);
      if (!agent || !message.trim()) return Effect.void;
      store.setInput("");
      return run("agent.send", { agent: agent.id, message: message.trim() });
    },
    cancel: Effect.suspend(() => {
      const agent = selectedAgent(store);
      return agent
        ? run("agent.cancel", { agent: agent.id })
        : Effect.fail(new ProtocolError({ message: "No agent is selected." }));
    }),
  };
}

function selectedAgent(store: AgentStore) {
  const state = store.getSnapshot();
  return state.agents.find((agent) => agent.id === state.selectedAgentId);
}
