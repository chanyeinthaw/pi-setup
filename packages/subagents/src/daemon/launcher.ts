import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { subagentStatePaths } from "../shared/paths.ts";

export const launchDaemon = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runtime = path.join(subagentStatePaths().root, "runtime");
  yield* fs.makeDirectory(runtime, { recursive: true });
  yield* fs.writeFileString(
    path.join(runtime, "package.json"),
    JSON.stringify({
      name: "subagents",
      version: "0.1.0",
      piConfig: { name: "pi", configDir: ".pi" },
    }),
  );
  process.env.PI_PACKAGE_DIR = runtime;
  const { daemonProgram } = yield* Effect.promise(() => import("./program.ts"));
  return yield* daemonProgram;
});
