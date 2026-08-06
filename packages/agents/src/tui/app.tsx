/** @jsxImportSource @opentui/react */
import type { CliRenderer } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useSyncExternalStore } from "react";
import type { AgentRecord } from "../shared/domain.ts";
import type { TranscriptRecord } from "../shared/notifications.ts";
import type { AgentStore } from "./store.ts";

export function App({
  renderer,
  store,
  send,
  cancel,
}: {
  readonly renderer?: CliRenderer;
  readonly store: AgentStore;
  readonly send: (message: string) => void;
  readonly cancel: () => void;
}) {
  const dimensions = useTerminalDimensions();
  const narrow = dimensions.width < 70;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const selected = Math.max(
    0,
    state.agents.findIndex((agent) => agent.id === state.selectedAgentId),
  );
  const selectedAgent = state.agents[selected];
  const transcript = selectedAgent ? (state.transcripts[selectedAgent.id] ?? []) : [];
  const counts = countStatuses(state.agents);

  useKeyboard((key) => {
    const escape = key.name === "escape" || key.name === "esc";
    if ((key.name === "q" || (key.ctrl && key.name === "c")) && state.focus !== "input") {
      renderer?.destroy();
    }
    if (narrow && escape && state.screen === "detail") {
      store.setScreen("list");
      store.setFocus("agents");
      return;
    }
    if (key.name === "tab" && (!narrow || state.screen === "detail")) {
      key.preventDefault();
      const order = ["transcript", "input"] as const;
      const index = order.indexOf(state.focus === "agents" ? "transcript" : state.focus);
      store.setFocus(order[(index + (key.shift ? 1 : 1)) % order.length]);
      return;
    }
    if (escape && state.focus === "input") {
      store.setFocus("transcript");
      return;
    }
    if (
      (key.name === "enter" || key.name === "return") &&
      narrow &&
      state.screen === "list" &&
      selectedAgent
    ) {
      store.setScreen("detail");
      store.setFocus("transcript");
      return;
    }
    if (key.name === "x" && state.focus !== "input" && selectedAgent?.status === "running") {
      cancel();
      return;
    }
    const canNavigate = narrow ? state.screen === "list" : state.focus !== "input";
    if (!canNavigate) return;
    if (key.name === "j" || key.name === "down") {
      store.select(state.agents[Math.min(state.agents.length - 1, selected + 1)]?.id);
    }
    if (key.name === "k" || key.name === "up") {
      store.select(state.agents[Math.max(0, selected - 1)]?.id);
    }
  });

  const list = <AgentList agents={state.agents} selected={selected} />;
  const detail = (
    <AgentDetail
      agent={selectedAgent}
      transcript={transcript}
      focus={state.focus}
      input={state.input}
      pending={state.command.pending}
      commandError={state.command.error}
      setInput={store.setInput}
      send={send}
      back={() => {
        if (narrow) {
          store.setScreen("list");
          store.setFocus("agents");
        } else {
          store.setFocus("transcript");
        }
      }}
    />
  );

  return (
    <box
      backgroundColor="#1f1f1f"
      style={{ flexDirection: "column", width: "100%", height: "100%" }}
    >
      <box
        backgroundColor="#292929"
        style={{ height: 2, paddingLeft: 2, paddingRight: 2, flexDirection: "row" }}
      >
        <text>
          ● {counts.running} · ✓ {counts.done} · ✕ {counts.failed}
        </text>
        <text style={{ marginLeft: "auto" }}>
          {state.connection}
          {state.error ? ` · ${state.error}` : ""}
        </text>
      </box>
      {narrow ? (
        <box style={{ flexGrow: 1 }}>
          {state.screen === "list" ? (
            <box backgroundColor="#282828" style={{ flexGrow: 1, padding: 2 }}>
              {list}
            </box>
          ) : (
            <box backgroundColor="#222222" style={{ flexGrow: 1, padding: 2 }}>
              {detail}
            </box>
          )}
        </box>
      ) : (
        <box style={{ flexGrow: 1, flexDirection: "row" }}>
          <box backgroundColor="#282828" style={{ width: 36, padding: 2 }}>
            {list}
          </box>
          <box backgroundColor="#181818" style={{ width: 1 }} />
          <box backgroundColor="#222222" style={{ flexGrow: 1, padding: 2 }}>
            {detail}
          </box>
        </box>
      )}
      <box backgroundColor="#292929" style={{ height: 2, paddingLeft: 2 }}>
        <text>
          {narrow && state.screen === "list"
            ? "j/k select · Enter open · x cancel · q quit"
            : "Tab focus · Enter send · x cancel · Esc back · q quit"}
        </text>
      </box>
    </box>
  );
}

function AgentList({
  agents,
  selected,
}: {
  readonly agents: ReadonlyArray<AgentRecord>;
  readonly selected: number;
}) {
  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      {agents.length === 0 ? (
        <text>No agents. The daemon is ready for model-started work.</text>
      ) : (
        agents.map((agent, index) => (
          <text
            key={agent.id}
            wrapMode="none"
            truncate
            bg={index === selected ? "#3a3a3a" : undefined}
            fg={index === selected ? "#e6e2b5" : "#d0d0d0"}
            style={{ height: 1, width: "100%", paddingLeft: 1, paddingRight: 1 }}
          >
            {statusGlyph(agent.status)} {agent.slug}
          </text>
        ))
      )}
    </box>
  );
}

function AgentDetail({
  agent,
  transcript,
  focus,
  input,
  pending,
  commandError,
  setInput,
  send,
  back,
}: {
  readonly agent?: AgentRecord;
  readonly transcript: ReadonlyArray<TranscriptRecord>;
  readonly focus: string;
  readonly input: string;
  readonly pending: boolean;
  readonly commandError?: string;
  readonly setInput: (value: string) => void;
  readonly send: (message: string) => void;
  readonly back: () => void;
}) {
  if (!agent) return <text>Select an agent to inspect its transcript.</text>;
  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      <text fg="#e6e2b5">{agent.slug}</text>
      <box style={{ height: 1, flexDirection: "row", gap: 1 }}>
        <text fg={statusColor(agent.status)}>{statusGlyph(agent.status)}</text>
        <text fg="#d0d0d0">{agent.status}</text>
        <text fg="#777777">·</text>
        <text fg="#999999" wrapMode="none" truncate>
          {agent.model ?? "default"}
        </text>
      </box>
      <text fg="#777777" wrapMode="none" truncate>
        {agent.cwd}
      </text>
      <scrollbox style={{ flexGrow: 1, marginTop: 1 }}>
        {transcript.length === 0 ? (
          <text>No transcript yet.</text>
        ) : (
          transcript.map((item) => (
            <box
              key={item.sequence}
              backgroundColor={item.role === "user" ? "#303030" : "#262626"}
              style={{ flexDirection: "column", marginBottom: 1, padding: 1 }}
            >
              <text fg="#999999">{item.role.toUpperCase()}</text>
              <text fg="#dddddd">{item.text}</text>
            </box>
          ))
        )}
      </scrollbox>
      <box backgroundColor="#353535" style={{ height: 3, flexDirection: "row", padding: 1 }}>
        <text fg="#8f8ac7">▌</text>
        <text fg="#e6e2b5">{agent.status === "running" ? " Steer › " : " Continue › "}</text>
        <input
          focused={focus === "input"}
          value={input}
          placeholder={pending ? "Sending…" : "Send a message to the selected agent"}
          onInput={setInput}
          onSubmit={(value) => send(typeof value === "string" ? value : input)}
          onKeyDown={(key) => {
            if (key.name === "escape" || key.name === "esc") {
              key.preventDefault();
              back();
            }
          }}
          style={{ flexGrow: 1 }}
        />
      </box>
      {commandError ? <text>SEND FAILED · {commandError}</text> : null}
    </box>
  );
}

function countStatuses(agents: ReadonlyArray<AgentRecord>) {
  return {
    running: agents.filter((agent) => agent.status === "running").length,
    done: agents.filter((agent) => agent.status === "done").length,
    failed: agents.filter((agent) => agent.status === "error").length,
  };
}

function statusColor(status: string) {
  switch (status) {
    case "running":
      return "#8f8ac7";
    case "done":
      return "#9fca86";
    case "error":
      return "#e06c75";
    case "cancelled":
      return "#999999";
    default:
      return "#d19a66";
  }
}

function statusGlyph(status: string) {
  switch (status) {
    case "running":
      return "●";
    case "done":
      return "✓";
    case "error":
      return "✕";
    case "cancelled":
      return "■";
    default:
      return "◇";
  }
}
