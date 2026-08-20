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

// Force-initialize the daemon's socket chunk in the compiled binary. The TUI
// bundle contains launcher.ts's `import("./program.ts")` (a lazy chunk that
// owns Effect's Socket service). If that chunk never runs, NodeSocket.makeNet
// throws `Socket.of is undefined` and the subscription hangs on "connecting".
await import("@effect/platform-node/NodeSocketServer");

export async function runTui(options: { readonly cwd?: string } = {}) {
  const hasExplicitCwd = Object.prototype.hasOwnProperty.call(options, "cwd");
  const cwd = hasExplicitCwd ? options.cwd : process.cwd();
  const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 60 });
  const store = createAgentStore();
  const fiber = runSubscription({ client: defaultClient, store, runtime, cwd });
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
