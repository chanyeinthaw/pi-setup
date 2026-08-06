/** @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Fiber from "effect/Fiber";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { defaultClient } from "../shared/default-client.ts";
import { App } from "./app.tsx";
import { makeAgentCommands } from "./commands.ts";
import { createAgentStore } from "./store.ts";
import { runSubscription } from "./subscription.ts";

const runtime = ManagedRuntime.make(BunServices.layer);

export async function runTui() {
  const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 60 });
  const store = createAgentStore();
  const fiber = runSubscription({ client: defaultClient, store, runtime });
  const commands = makeAgentCommands(defaultClient, store);
  renderer.once("destroy", () => {
    runtime.runFork(Fiber.interrupt(fiber));
  });
  createRoot(renderer).render(
    <App
      renderer={renderer}
      store={store}
      send={(message) => runtime.runFork(commands.send(message))}
      cancel={() => runtime.runFork(commands.cancel)}
    />,
  );
}
