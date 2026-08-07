/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../src/tui/app.tsx";
import { createAgentStore } from "../src/tui/store.ts";

function makeStore() {
  const store = createAgentStore();
  store.apply({
    type: "snapshot",
    agents: [
      {
        id: "a1",
        slug: "auth-audit",
        name: "Auth audit",
        prompt: "Inspect auth",
        cwd: "/repo",
        model: "gpt-5.6-luna",
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    transcripts: {
      a1: [
        {
          sequence: 1,
          agentId: "a1",
          timestamp: 1,
          role: "assistant",
          text: "Found a refresh-token issue.",
        },
      ],
    },
  });
  return store;
}

test("starts on the subagent dashboard with the transcript visible", async () => {
  const store = makeStore();
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("auth-audit");
    expect(frame).toContain("● 1  ✓ 0  ✕ 0");
    expect(frame).toContain("Found a refresh-token issue");
    expect(frame).toContain("Send a message");
    expect(store.getSnapshot().focus).toBe("agents");
  } finally {
    setup.renderer.destroy();
  }
});

test("enter on the subagent list switches to input; esc steps back through transcript", async () => {
  const store = makeStore();
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    expect(store.getSnapshot().focus).toBe("agents");

    // Enter on agents → input (TI)
    await act(async () => setup.mockInput.pressEnter());
    expect(store.getSnapshot().focus).toBe("input");

    // Escape from input → transcript
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("transcript");

    // Escape from transcript → agents
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("agents");

    // i also switches to input from agents
    await act(async () => setup.mockInput.pressKey("i"));
    expect(store.getSnapshot().focus).toBe("input");
  } finally {
    setup.renderer.destroy();
  }
});

test("x kills the selected running subagent on the list and transcript", async () => {
  const store = makeStore();
  let killed = 0;
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => killed++} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    expect(store.getSnapshot().focus).toBe("agents");
    await act(async () => setup.mockInput.pressKey("x"));
    expect(killed).toBe(1);

    // x also kills while focused on the transcript (esc from input → transcript)
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("agents");
    await act(async () => setup.mockInput.pressEnter());
    expect(store.getSnapshot().focus).toBe("input");
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("transcript");
    await act(async () => setup.mockInput.pressKey("x"));
    expect(killed).toBe(2);

    // x does not kill while focused on the prompt (i from transcript → input)
    await act(async () => setup.mockInput.pressKey("i"));
    expect(store.getSnapshot().focus).toBe("input");
    await act(async () => setup.mockInput.pressKey("x"));
    expect(killed).toBe(2);
  } finally {
    setup.renderer.destroy();
  }
});

test("escape steps back: input → transcript → subagents, the list is a no-op", async () => {
  const store = makeStore();
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    // Start on the subagent list (default). Esc on the list does nothing.
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("agents");

    // Enter on agents → input, esc goes back to transcript, esc → agents
    await act(async () => setup.mockInput.pressEnter());
    expect(store.getSnapshot().focus).toBe("input");
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("transcript");
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getSnapshot().focus).toBe("agents");
  } finally {
    setup.renderer.destroy();
  }
});

test("selects a subagent and focuses the transcript with the mouse", async () => {
  const store = makeStore();
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    const row = setup.renderer.root.findDescendantById("agent-row-a1");
    expect(row).toBeDefined();
    await act(async () => setup.mockMouse.click(row!.screenX + 2, row!.screenY + 1));
    expect(store.getSnapshot().selectedAgentId).toBe("a1");
    expect(store.getSnapshot().focus).toBe("transcript");
  } finally {
    setup.renderer.destroy();
  }
});

test("j/k and arrows navigate subagents in A mode", async () => {
  const store = makeStore();
  store.apply({
    type: "agent.created",
    agent: {
      id: "a2",
      slug: "db-migrate",
      name: "DB migrate",
      prompt: "Migrate",
      cwd: "/repo",
      model: "glm-5.1",
      status: "done",
      createdAt: 2,
      updatedAt: 2,
    },
  });
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    // Running sorts before done, so a1 is selected
    expect(store.getSnapshot().selectedAgentId).toBe("a1");
    await act(async () => setup.mockInput.pressKey("j"));
    expect(store.getSnapshot().selectedAgentId).toBe("a2");
    await act(async () => setup.mockInput.pressKey("k"));
    expect(store.getSnapshot().selectedAgentId).toBe("a1");
    await act(async () => setup.mockInput.pressKey("ARROW_DOWN"));
    expect(store.getSnapshot().selectedAgentId).toBe("a2");
    await act(async () => setup.mockInput.pressKey("ARROW_UP"));
    expect(store.getSnapshot().selectedAgentId).toBe("a1");
  } finally {
    setup.renderer.destroy();
  }
});

test("shows the mode label in the bottom bar", async () => {
  const store = makeStore();
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("A  ● connected");
    // Enter on agents → TI
    await act(async () => setup.mockInput.pressEnter());
    await setup.waitForFrame((frame) => frame.includes("TI  ● connected"));
    // Esc → TV
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    await setup.waitForFrame((frame) => frame.includes("TV  ● connected"));
    // Esc → A
    await act(async () => setup.mockInput.pressEscape());
    await new Promise((resolve) => setTimeout(resolve, 50));
    await setup.waitForFrame((frame) => frame.includes("A  ● connected"));
  } finally {
    setup.renderer.destroy();
  }
});

test("shows tool calls as Name {params} and hides tool results", async () => {
  const store = makeStore();
  store.apply({
    type: "transcript.appended",
    agentId: "a1",
    item: {
      sequence: 2,
      agentId: "a1",
      timestamp: 2,
      role: "assistant",
      text: 'TOOL CALL bash\n{"command":"ls"}',
    },
  });
  store.apply({
    type: "transcript.appended",
    agentId: "a1",
    item: {
      sequence: 3,
      agentId: "a1",
      timestamp: 3,
      role: "tool",
      text: "bash [success]\nfile1 file2",
    },
  });
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain('Bash {"command":"ls"}');
    expect(frame).not.toContain("[success]");
    expect(frame).not.toContain("file1 file2");
  } finally {
    setup.renderer.destroy();
  }
});
