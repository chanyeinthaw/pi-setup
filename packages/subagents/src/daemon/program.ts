import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { subagentStatePaths } from "../shared/paths.ts";
import { layer as managerLayer } from "./agent-manager.ts";
import { layer as notificationsLayer } from "./notifications.ts";
import { layer as piSessionLayer } from "./pi-session-driver.ts";
import { layer as registryLayer } from "./registry.ts";
import { serve } from "./server.ts";

const paths = subagentStatePaths();
const bunServices = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);
const database = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(paths.root, { recursive: true });
    return SqliteClient.layer({ filename: paths.database }).pipe(Layer.provide(Reactivity.layer));
  }),
).pipe(Layer.provide(bunServices));
const registryWithNotifications = registryLayer.pipe(Layer.provideMerge(notificationsLayer));
const appLayer = managerLayer.pipe(
  Layer.provideMerge(registryWithNotifications),
  Layer.provideMerge(notificationsLayer),
  Layer.provideMerge(piSessionLayer),
  Layer.provideMerge(database),
  Layer.provideMerge(bunServices),
);

export const daemonProgram = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(paths.root, { recursive: true });
  yield* fs.remove(paths.socket).pipe(Effect.ignore);
  return yield* serve(paths.socket);
}).pipe(Effect.provide(appLayer));
