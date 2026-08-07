import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { assert, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { AgentManager, layer as managerLayer } from "../src/daemon/agent-manager.ts";
import { layer as notificationsLayer } from "../src/daemon/notifications.ts";
import { AgentRegistry, layer as registryLayer } from "../src/daemon/registry.ts";
import { AgentSessionDriver } from "../src/daemon/session-driver.ts";
import { AgentError } from "../src/shared/domain.ts";

const database = SqliteClient.layer({ filename: ":memory:" }).pipe(Layer.provide(Reactivity.layer));
const registry = registryLayer.pipe(
  Layer.provideMerge(database),
  Layer.provide(notificationsLayer),
);
const failingDriver = Layer.succeed(
  AgentSessionDriver,
  AgentSessionDriver.of({
    start: () =>
      Effect.fail(
        new AgentError({
          message: "Failed to create native Pi session.",
          cause: new Error("Unknown model luna"),
        }),
      ),
  }),
);
const dependencies = Layer.mergeAll(registry, notificationsLayer, failingDriver);
const testLayer = managerLayer.pipe(Layer.provideMerge(dependencies));

layer(testLayer)("startup failure", (it) => {
  it.effect("persists the underlying failure as an error subagent", () =>
    Effect.gen(function* () {
      const manager = yield* AgentManager;
      yield* manager
        .start({ name: "bad model", prompt: "test", cwd: "/repo", model: "luna" })
        .pipe(Effect.flip);
      const registry = yield* AgentRegistry;
      const agent = yield* registry.get("bad-model");
      assert.strictEqual(agent?.status, "error");
      assert.match(agent?.errorText ?? "", /Unknown model luna/);
    }),
  );
});
