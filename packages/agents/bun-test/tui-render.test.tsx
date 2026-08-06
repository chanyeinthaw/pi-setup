/** @jsxImportSource @opentui/react */
import { expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
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

test("renders the wide dashboard", async () => {
  const setup = await testRender(<App store={makeStore()} send={() => {}} cancel={() => {}} />, {
    width: 100,
    height: 30,
  });
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("● 1 · ✓ 0 · ✕ 0");
    expect(frame).toContain("auth-audit");
    expect(frame).toContain("Found a refresh-token issue");
    expect(frame).toContain("Steer ›");
  } finally {
    setup.renderer.destroy();
  }
});

test("uses list and detail screens on narrow terminals", async () => {
  const store = makeStore();
  const setup = await testRender(<App store={store} send={() => {}} cancel={() => {}} />, {
    width: 60,
    height: 24,
  });
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Enter open");
    expect(setup.captureCharFrame()).not.toContain("Found a refresh-token issue");
    setup.mockInput.pressEnter();
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Found a refresh-token issue");
    expect(setup.captureCharFrame()).toContain("Esc back");
    setup.mockInput.pressEscape();
    const listFrame = await setup.waitForFrame((frame) => frame.includes("Enter open"), {
      maxPasses: 40,
    });
    expect(listFrame).toContain("Enter open");
    setup.mockInput.pressKey("j");
    await setup.renderOnce();
    expect(store.getSnapshot().focus).toBe("agents");
  } finally {
    setup.renderer.destroy();
  }
});
