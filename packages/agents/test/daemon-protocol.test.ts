import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { assert, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { layer as managerLayer } from "../src/daemon/agent-manager.ts";
import { layer as notificationsLayer } from "../src/daemon/notifications.ts";
import { layer as registryLayer } from "../src/daemon/registry.ts";
import { dispatch } from "../src/daemon/server.ts";
import { layer as fakeSessionLayer } from "./support/fake-session-driver.ts";

const database = SqliteClient.layer({ filename: ":memory:" }).pipe(Layer.provide(Reactivity.layer));
const registry = registryLayer.pipe(
  Layer.provideMerge(database),
  Layer.provide(notificationsLayer),
);
const dependencies = Layer.mergeAll(registry, fakeSessionLayer, notificationsLayer);
const makeTestLayer = managerLayer.pipe(Layer.provideMerge(dependencies));

layer(makeTestLayer)("daemon protocol", (it) => {
  it.effect("starts, steers, settles, and delivers", () =>
    Effect.gen(function* () {
      const started: any = yield* dispatch("agent.start", {
        name: "audit",
        prompt: "Inspect auth",
        cwd: "/repo",
        parentSessionId: "parent-1",
      });
      assert.strictEqual(started.agent.slug, "audit");
      assert.strictEqual(started.agent.status, "running");
      yield* dispatch("agent.send", { agent: "audit", message: "Check refresh tokens" });
      yield* Effect.yieldNow;
      const result: any = yield* dispatch("agent.wait", {
        agent: "audit",
        parentSessionId: "parent-1",
      });
      assert.strictEqual(result.agent.status, "done");
      assert.match(result.agent.finalText, /Inspect auth/);
      assert.isTrue(result.deliveryConsumed);
      const pendingAfterWait: any = yield* dispatch("delivery.pending", {
        parentSessionId: "parent-1",
      });
      assert.strictEqual(pendingAfterWait.deliveries.length, 0);
      const finished: any = yield* dispatch("agent.wait", {
        agent: "audit",
        parentSessionId: "parent-1",
      });
      assert.strictEqual(finished.agent.status, "done");
      assert.isFalse(finished.deliveryConsumed);
    }),
  );
});
