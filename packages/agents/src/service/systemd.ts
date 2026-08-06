import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { AgentError } from "../shared/domain.ts";

export const serviceName = "agents.service";

export function renderSystemdUserService(options: {
  readonly executable: string;
  readonly path?: string;
}) {
  return `[Unit]
Description=Native Pi background agents daemon
After=default.target

[Service]
Type=simple
ExecStart=${systemdEscape(options.executable)} daemon run
Restart=on-failure
RestartSec=2
Environment=PI_HOME=%h/.pi
Environment="PATH=${systemdEnvironment(options.path ?? defaultServicePath)}"

[Install]
WantedBy=default.target
`;
}

export const unitPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = process.env.HOME;
  if (!home) return yield* new AgentError({ message: "HOME is not set." });
  return path.join(home, ".config", "systemd", "user", serviceName);
});

export const install = (options: { readonly executable: string; readonly path?: string }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* unitPath;
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, renderSystemdUserService(options));
    yield* systemctl("daemon-reload");
    yield* systemctl("enable", "--now", serviceName);
    yield* systemctl("restart", serviceName);
    return target;
  }).pipe(mapPlatformError("Failed to install agents user service."));

export const uninstall = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const target = yield* unitPath;
  yield* systemctl("disable", "--now", serviceName).pipe(Effect.ignore);
  yield* fs.remove(target).pipe(Effect.ignore);
  yield* systemctl("daemon-reload");
}).pipe(mapPlatformError("Failed to uninstall agents user service."));

export const start = systemctl("start", serviceName);
export const stop = systemctl("stop", serviceName);
export const restart = systemctl("restart", serviceName);
export const status = systemctlOutput("status", "--no-pager", serviceName);
export const logs = systemctlOutput("--user-unit", serviceName, "--no-pager", "-n", "200", {
  command: "journalctl",
});

function systemctl(...args: ReadonlyArray<string>) {
  return commandExit("systemctl", ["--user", ...args]);
}

function systemctlOutput(...input: ReadonlyArray<string | { readonly command: string }>) {
  const option = input.at(-1);
  const command = typeof option === "object" ? option.command : "systemctl";
  const args = (typeof option === "object" ? input.slice(0, -1) : ["--user", ...input]) as string[];
  return Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* spawner.string(ChildProcess.make(command, args), { includeStderr: true });
  }).pipe(mapPlatformError(`Failed to run ${command}.`));
}

function commandExit(command: string, args: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const handle = yield* ChildProcess.make(command, args);
    const code = yield* handle.exitCode;
    if (Number(code) !== 0) {
      return yield* new AgentError({ message: `${command} exited with code ${code}.` });
    }
  }).pipe(Effect.scoped, mapPlatformError(`Failed to run ${command}.`));
}

function mapPlatformError(message: string) {
  return Effect.mapError((cause: unknown) =>
    cause instanceof AgentError ? cause : new AgentError({ message, cause }),
  );
}

const defaultServicePath = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function systemdEnvironment(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function systemdEscape(value: string) {
  return value.replaceAll("\\", "\\x5c").replaceAll(" ", "\\x20");
}
