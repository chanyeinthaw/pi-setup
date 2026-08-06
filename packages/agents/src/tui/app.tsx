/** @jsxImportSource @opentui/react */
import { MacOSScrollAccel } from "@opentui/core";
import type { CliRenderer, MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Ref } from "react";
import type { AgentRecord } from "../shared/domain.ts";
import type { TranscriptRecord } from "../shared/notifications.ts";
import type { AgentStore, TuiFocus } from "./store.ts";

/**
 * Design tokens — dark palette, no borders: regions are separated by
 * background color bands. Semantics: background < sidebar < surface <
 * surfaceAlt < selected; prompt is the input band.
 */
const colors = {
  background: "#0d1117",
  sidebar: "#10151d",
  surface: "#151b25",
  surfaceAlt: "#1a2230",
  prompt: "#1c2533",
  promptFocused: "#26324a",
  selected: "#1c2533",
  accent: "#6ea8fe",
  text: "#dde5ef",
  muted: "#8b9bb4",
  dim: "#5f6e85",
  success: "#3fb950",
  error: "#f47067",
  warning: "#d29922",
  userBg: "#1f2c45",
};

const statusMeta: Record<
  AgentRecord["status"],
  { readonly glyph: string; readonly color: string }
> = {
  running: { glyph: "●", color: colors.accent },
  done: { glyph: "✓", color: colors.success },
  error: { glyph: "✕", color: colors.error },
  cancelled: { glyph: "■", color: colors.muted },
  orphaned: { glyph: "◇", color: colors.warning },
};

const sidebarScrollbar = {
  trackOptions: { backgroundColor: colors.sidebar, foregroundColor: colors.dim },
};

const surfaceScrollbar = {
  trackOptions: { backgroundColor: colors.surface, foregroundColor: colors.dim },
};

const scrollAcceleration = new MacOSScrollAccel({ maxMultiplier: 8 });

const hints: Record<TuiFocus, string> = {
  agents: "↑↓/jk move · Enter/i prompt · x kill · q quit",
  transcript: "↑↓/jk scroll · g/G jump · x kill · i prompt · q quit",
  input: "Enter send · Esc back",
};

const modeLabel: Record<TuiFocus, string> = {
  agents: "A",
  transcript: "TV",
  input: "TI",
};

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
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const transcriptRef = useRef<ScrollBoxRenderable | null>(null);
  const agentsRef = useRef<ScrollBoxRenderable | null>(null);
  const width = dimensions?.width ?? 100;
  const selected = Math.max(
    0,
    state.agents.findIndex((agent) => agent.id === state.selectedAgentId),
  );
  const selectedAgent = state.agents[selected];
  const transcript = selectedAgent ? (state.transcripts[selectedAgent.id] ?? []) : [];
  const counts = countStatuses(state.agents);
  const sidebarWidth = Math.min(
    Math.max(20, Math.min(34, Math.floor(width * 0.24))),
    Math.max(12, width - 16),
  );
  const focus: TuiFocus = state.focus === "input" ? "input" : "transcript";
  const activeFocus: TuiFocus = state.focus === "agents" ? "agents" : focus;

  useKeyboard((key) => {
    const escape = key.name === "escape" || key.name === "esc";

    if (key.name === "i" && activeFocus !== "input") {
      key.preventDefault();
      store.setFocus("input");
      return;
    }

    if (escape) {
      key.preventDefault();
      if (activeFocus === "input") store.setFocus("transcript");
      else if (activeFocus === "transcript") store.setFocus("agents");
      // On agents: escape does nothing.
      return;
    }

    if ((key.name === "q" || (key.ctrl && key.name === "c")) && activeFocus !== "input") {
      renderer?.destroy();
      return;
    }

    if (key.name === "x" && activeFocus !== "input" && selectedAgent?.status === "running") {
      cancel();
      return;
    }

    if (activeFocus === "agents") {
      const enter = key.name === "enter" || key.name === "return";
      if (enter) {
        key.preventDefault();
        store.setFocus("input");
        return;
      }
      if (key.name === "j" || key.name === "down") {
        const next = state.agents[Math.min(state.agents.length - 1, selected + 1)]?.id;
        store.select(next);
        if (next) agentsRef.current?.scrollChildIntoView(`agent-row-${next}`);
      }
      if (key.name === "k" || key.name === "up") {
        const previous = state.agents[Math.max(0, selected - 1)]?.id;
        store.select(previous);
        if (previous) agentsRef.current?.scrollChildIntoView(`agent-row-${previous}`);
      }
      if (key.name === "g" && !key.shift) {
        store.select(state.agents[0]?.id);
        agentsRef.current?.scrollChildIntoView(`agent-row-${state.agents[0]?.id}`);
      } else if ((key.name === "g" && key.shift) || key.name === "end") {
        store.select(state.agents[state.agents.length - 1]?.id);
        agentsRef.current?.scrollChildIntoView(
          `agent-row-${state.agents[state.agents.length - 1]?.id}`,
        );
      } else if (key.name === "home") {
        store.select(state.agents[0]?.id);
        agentsRef.current?.scrollChildIntoView(`agent-row-${state.agents[0]?.id}`);
      }
      return;
    }

    if (activeFocus === "transcript") {
      if (key.name === "g" && !key.shift) {
        key.preventDefault();
        transcriptRef.current?.scrollTo(0);
        return;
      }
      if ((key.name === "g" && key.shift) || key.name === "end") {
        key.preventDefault();
        const scrollbox = transcriptRef.current;
        if (scrollbox) scrollbox.scrollTo(scrollbox.scrollHeight);
        return;
      }
      if (key.name === "home") {
        key.preventDefault();
        transcriptRef.current?.scrollTo(0);
        return;
      }
    }
  });

  return (
    <box
      backgroundColor={colors.background}
      style={{ flexDirection: "column", width: "100%", height: "100%" }}
    >
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        <box backgroundColor={colors.surface} style={{ flexGrow: 1, flexDirection: "column" }}>
          <AgentHeader agent={selectedAgent} />
          <scrollbox
            id="transcript-scrollbox"
            ref={transcriptRef}
            focused={activeFocus === "transcript"}
            stickyScroll
            stickyStart="bottom"
            scrollY
            onMouseDown={(event) => {
              event.preventDefault();
              store.setFocus("transcript");
            }}
            scrollbarOptions={surfaceScrollbar}
            scrollAcceleration={scrollAcceleration}
            style={{ flexGrow: 1 }}
            contentOptions={{
              flexDirection: "column",
              paddingLeft: 1,
              paddingRight: 1,
              minHeight: 0,
            }}
          >
            <AgentTranscript agent={selectedAgent} transcript={transcript} />
          </scrollbox>
          <box
            backgroundColor={activeFocus === "input" ? colors.promptFocused : colors.prompt}
            onMouseDown={(event) => {
              event.preventDefault();
              store.setFocus("input");
            }}
            style={{ height: 3, flexDirection: "row", alignItems: "center", paddingX: 2 }}
          >
            <text fg={activeFocus === "input" ? colors.accent : colors.dim}>
              {state.command.pending ? "●" : "›"}
            </text>
            <input
              focused={activeFocus === "input"}
              value={state.input}
              placeholder={state.command.pending ? "Sending…" : "Send a message…"}
              placeholderColor={colors.dim}
              textColor={colors.text}
              cursorColor={colors.accent}
              onInput={store.setInput}
              onSubmit={(value) => send(typeof value === "string" ? value : state.input)}
              onKeyDown={(key) => {
                if (key.name === "escape" || key.name === "esc") {
                  key.preventDefault();
                  store.setFocus("transcript");
                }
              }}
              style={{ flexGrow: 1, marginLeft: 1 }}
            />
          </box>
          {state.command.error ? (
            <text fg={colors.error} wrapMode="none" truncate style={{ height: 1, paddingX: 2 }}>
              ⚠ SEND FAILED · {state.command.error}
            </text>
          ) : null}
        </box>
        <box
          backgroundColor={colors.sidebar}
          style={{ width: sidebarWidth, flexDirection: "column" }}
        >
          <box
            style={{
              height: 3,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingTop: 1,
              paddingRight: 1,
            }}
          >
            <text fg={colors.accent}>● {counts.running}</text>
            <text fg={colors.success} style={{ marginLeft: 2 }}>
              ✓ {counts.done}
            </text>
            <text fg={colors.error} style={{ marginLeft: 2 }}>
              ✕ {counts.failed}
            </text>
          </box>
          <AgentList
            agents={state.agents}
            selected={selected}
            scrollRef={agentsRef}
            onSelect={(agent) => {
              store.select(agent.id);
              store.setFocus("transcript");
            }}
          />
        </box>
      </box>
      <Footer
        mode={modeLabel[activeFocus]}
        connection={state.connection}
        error={state.error}
        hints={hints[activeFocus]}
      />
    </box>
  );
}

function AgentList({
  agents,
  selected,
  onSelect,
  scrollRef,
}: {
  readonly agents: ReadonlyArray<AgentRecord>;
  readonly selected: number;
  readonly onSelect: (agent: AgentRecord) => void;
  readonly scrollRef?: Ref<ScrollBoxRenderable>;
}) {
  const [hoveredId, setHoveredId] = useState<string>();

  if (agents.length === 0) {
    return (
      <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <box style={{ flexDirection: "column", padding: 2 }}>
          <text fg={colors.muted}>No agents yet.</text>
          <text fg={colors.dim} style={{ marginTop: 1 }}>
            Agents appear here when pi starts one.
          </text>
        </box>
      </box>
    );
  }

  return (
    <scrollbox
      ref={scrollRef}
      style={{ flexGrow: 1 }}
      contentOptions={{ flexDirection: "column", minHeight: 0 }}
      scrollY
      scrollbarOptions={sidebarScrollbar}
      scrollAcceleration={scrollAcceleration}
    >
      {agents.map((agent, index) => {
        const active = index === selected;
        const hovered = hoveredId === agent.id;
        const meta = statusMeta[agent.status];
        return (
          <box
            id={`agent-row-${agent.id}`}
            key={agent.id}
            backgroundColor={active ? colors.selected : hovered ? colors.surfaceAlt : undefined}
            onMouseOver={() => setHoveredId(agent.id)}
            onMouseOut={() => setHoveredId(undefined)}
            onMouseDown={(event) => handleAgentMouse(event, agent, onSelect)}
            style={{
              width: "100%",
              height: 4,
              paddingY: 1,
              paddingLeft: 1,
              paddingRight: 1,
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <box style={{ flexDirection: "row", alignItems: "center" }}>
              <text
                fg={active ? colors.text : colors.text}
                wrapMode="none"
                truncate
                style={{ flexGrow: 1 }}
              >
                {active ? <strong>{agent.slug}</strong> : agent.slug}
              </text>
              <text fg={meta.color} wrapMode="none" style={{ marginLeft: 1 }}>
                {meta.glyph}
              </text>
            </box>
            <box style={{ flexDirection: "row", alignItems: "center" }}>
              <text fg={colors.dim} wrapMode="none" truncate style={{ flexGrow: 1 }}>
                {agent.model ?? "default"}
              </text>
              <text fg={colors.dim} wrapMode="none" style={{ marginLeft: 2 }}>
                {formatAge(agent.updatedAt)}
              </text>
            </box>
          </box>
        );
      })}
    </scrollbox>
  );
}

function handleAgentMouse(
  event: MouseEvent,
  agent: AgentRecord,
  onSelect: (agent: AgentRecord) => void,
) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  onSelect(agent);
}

function AgentHeader({ agent }: { readonly agent?: AgentRecord }) {
  if (!agent) {
    return (
      <box
        backgroundColor={colors.sidebar}
        style={{ height: 3, paddingX: 2, justifyContent: "center" }}
      >
        <text fg={colors.muted}>Select an agent to inspect its transcript.</text>
      </box>
    );
  }
  const meta = statusMeta[agent.status];
  return (
    <box
      backgroundColor={colors.sidebar}
      style={{ height: 3, paddingX: 2, flexDirection: "row", alignItems: "center" }}
    >
      <text fg={colors.text}>
        <strong>{agent.slug}</strong>
      </text>
      <text fg={meta.color} style={{ marginLeft: 2 }}>
        {meta.glyph}
      </text>
      <text fg={colors.muted} wrapMode="none" truncate style={{ marginLeft: "auto" }}>
        {agent.model ?? "default"} · {agent.cwd} · {formatAge(agent.updatedAt)}
      </text>
    </box>
  );
}

function AgentTranscript({
  agent,
  transcript,
}: {
  readonly agent?: AgentRecord;
  readonly transcript: ReadonlyArray<TranscriptRecord>;
}) {
  if (!agent) return <text fg={colors.muted}>Select an agent to inspect its transcript.</text>;

  if (transcript.length === 0) {
    return (
      <box style={{ flexDirection: "column", padding: 2 }}>
        <text fg={colors.muted}>No transcript yet.</text>
        <text fg={colors.dim} style={{ marginTop: 1 }}>
          Type a message below to start the conversation.
        </text>
      </box>
    );
  }

  return (
    <box style={{ flexDirection: "column" }}>
      {transcript.map((item) => {
        if (item.role === "user") {
          return (
            <box
              key={item.sequence}
              backgroundColor={colors.userBg}
              style={{ flexDirection: "column", marginBottom: 1, padding: 1 }}
            >
              <text fg={colors.text} selectable wrapMode="word">
                {item.text}
              </text>
            </box>
          );
        }
        if (item.role === "tool") {
          // Tool results are not shown; only tool calls are displayed.
          return null;
        }
        return splitTranscriptSections(item.text).map((section, index) => {
          const key = `${item.sequence}-${index}`;
          if (section.kind === "toolCall") {
            return (
              <text key={key} fg={colors.dim} wrapMode="none" truncate style={{ paddingLeft: 1 }}>
                <strong>{capitalize(section.name)}</strong>
                {section.args ? ` ${section.args}` : ""}
              </text>
            );
          }
          return (
            <text
              key={key}
              fg={colors.text}
              selectable
              wrapMode="word"
              style={{ marginBottom: 1, paddingLeft: 1 }}
            >
              {section.text}
            </text>
          );
        });
      })}
    </box>
  );
}

type TranscriptSection =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "toolCall"; readonly name: string; readonly args?: string };

function splitTranscriptSections(text: string): ReadonlyArray<TranscriptSection> {
  return text.split(/\n{2,}/).map((section) => {
    const call = section.match(/^TOOL CALL (\S+)\s*\n?([\s\S]*)$/);
    if (call) {
      return { kind: "toolCall", name: call[1], args: call[2]?.trim() || undefined };
    }
    return { kind: "text", text: section };
  });
}

function capitalize(name: string) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

function Footer({
  mode,
  connection,
  error,
  hints,
}: {
  readonly mode: string;
  readonly connection: string;
  readonly error?: string;
  readonly hints: string;
}) {
  return (
    <box
      backgroundColor={colors.background}
      style={{ height: 3, flexDirection: "row", alignItems: "center", paddingY: 1, paddingX: 1 }}
    >
      <text fg={colors.accent} style={{ flexShrink: 0 }}>
        <strong>{mode}</strong>
      </text>
      <StatusText connection={connection} error={error} />
      <text fg={colors.dim} style={{ marginLeft: "auto", maxWidth: "50%" }}>
        {hints}
      </text>
    </box>
  );
}

function StatusText({
  connection,
  error,
}: {
  readonly connection: string;
  readonly error?: string;
}) {
  return (
    <text fg={colors.muted} wrapMode="none" style={{ flexShrink: 0, marginLeft: 2 }}>
      <span fg={connectionColor(connection)}>●</span> {connection}
      {error ? ` · ${error}` : ""}
    </text>
  );
}

function countStatuses(agents: ReadonlyArray<AgentRecord>) {
  return {
    running: agents.filter((agent) => agent.status === "running").length,
    done: agents.filter((agent) => agent.status === "done").length,
    failed: agents.filter((agent) => agent.status === "error").length,
  };
}

function connectionColor(connection: string) {
  switch (connection) {
    case "connected":
      return colors.success;
    case "connecting":
      return colors.warning;
    default:
      return colors.error;
  }
}

function formatAge(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
