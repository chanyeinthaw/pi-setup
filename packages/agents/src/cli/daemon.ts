import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Command from "effect/unstable/cli/Command";
import { launchDaemon } from "../daemon/launcher.ts";
import * as Systemd from "../service/systemd.ts";

const install = Command.make("install").pipe(
  Command.withHandler(() =>
    Effect.gen(function* () {
      const target = yield* Systemd.install({
        executable: process.execPath,
        path: process.env.PATH,
      });
      yield* Console.log(`Installed and started ${Systemd.serviceName}: ${target}`);
    }),
  ),
);
const uninstall = Command.make("uninstall").pipe(
  Command.withHandler(() =>
    Systemd.uninstall.pipe(Effect.andThen(Console.log(`Uninstalled ${Systemd.serviceName}.`))),
  ),
);
const start = Command.make("start").pipe(
  Command.withHandler(() => Systemd.start.pipe(Effect.andThen(Console.log("Daemon started.")))),
);
const stop = Command.make("stop").pipe(
  Command.withHandler(() => Systemd.stop.pipe(Effect.andThen(Console.log("Daemon stopped.")))),
);
const restart = Command.make("restart").pipe(
  Command.withHandler(() => Systemd.restart.pipe(Effect.andThen(Console.log("Daemon restarted.")))),
);
const status = Command.make("status").pipe(
  Command.withHandler(() => Systemd.status.pipe(Effect.flatMap(Console.log))),
);
const logs = Command.make("logs").pipe(
  Command.withHandler(() => Systemd.logs.pipe(Effect.flatMap(Console.log))),
);
const run = Command.make("run").pipe(Command.withHandler(() => launchDaemon));

export const daemonCommand = Command.make("daemon").pipe(
  Command.withSubcommands([install, uninstall, start, stop, restart, status, logs, run]),
);
