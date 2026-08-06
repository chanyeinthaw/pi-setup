import type { AgentRecord } from "../shared/domain.ts";
import type {
  AgentNotification,
  AgentSnapshot,
  TranscriptRecord,
} from "../shared/notifications.ts";

export type ConnectionState = "connecting" | "connected" | "disconnected";
export type TuiFocus = "agents" | "transcript" | "input";
export type TuiScreen = "list" | "detail";

export interface CommandState {
  readonly pending: boolean;
  readonly error?: string;
}

export interface AgentTuiState {
  readonly connection: ConnectionState;
  readonly agents: ReadonlyArray<AgentRecord>;
  readonly transcripts: Readonly<Record<string, ReadonlyArray<TranscriptRecord>>>;
  readonly selectedAgentId?: string;
  readonly focus: TuiFocus;
  readonly input: string;
  readonly screen: TuiScreen;
  readonly command: CommandState;
  readonly error?: string;
}

export type StoreMessage = AgentSnapshot | AgentNotification;

export interface AgentStore {
  readonly getSnapshot: () => AgentTuiState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly apply: (message: StoreMessage) => void;
  readonly setConnection: (connection: ConnectionState, error?: string) => void;
  readonly select: (agentId: string | undefined) => void;
  readonly setFocus: (focus: TuiFocus) => void;
  readonly setInput: (input: string) => void;
  readonly setScreen: (screen: TuiScreen) => void;
  readonly setCommand: (command: CommandState) => void;
}

export function createAgentStore(): AgentStore {
  let state: AgentTuiState = {
    connection: "connecting",
    agents: [],
    transcripts: {},
    focus: "agents",
    input: "",
    screen: "list",
    command: { pending: false },
  };
  const listeners = new Set<() => void>();
  const update = (next: AgentTuiState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: (message) => {
      if (message.type === "snapshot") {
        const agents = sortAgents(message.agents);
        update({
          ...state,
          connection: "connected",
          error: undefined,
          agents,
          transcripts: message.transcripts,
          selectedAgentId:
            state.selectedAgentId && agents.some((item) => item.id === state.selectedAgentId)
              ? state.selectedAgentId
              : agents[0]?.id,
        });
        return;
      }
      if (message.type === "agent.created" || message.type === "agent.updated") {
        const agents = sortAgents([
          ...state.agents.filter((item) => item.id !== message.agent.id),
          message.agent,
        ]);
        update({
          ...state,
          agents,
          selectedAgentId: state.selectedAgentId ?? message.agent.id,
        });
        return;
      }
      const previous = state.transcripts[message.agentId] ?? [];
      update({
        ...state,
        transcripts: {
          ...state.transcripts,
          [message.agentId]: [...previous, message.item],
        },
      });
    },
    setConnection: (connection, error) => update({ ...state, connection, error }),
    select: (selectedAgentId) => update({ ...state, selectedAgentId }),
    setFocus: (focus) => update({ ...state, focus }),
    setInput: (input) => update({ ...state, input }),
    setScreen: (screen) => update({ ...state, screen }),
    setCommand: (command) => update({ ...state, command }),
  };
}

function sortAgents(agents: ReadonlyArray<AgentRecord>) {
  return [...agents].sort((left, right) => {
    const rank = (status: AgentRecord["status"]) => (status === "running" ? 0 : 1);
    return rank(left.status) - rank(right.status) || right.createdAt - left.createdAt;
  });
}
