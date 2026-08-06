import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type * as Scope from "effect/Scope";
import type { AgentChange } from "../shared/notifications.ts";

export interface AgentNotificationsShape {
  readonly publish: (change: AgentChange) => Effect.Effect<void>;
  readonly changes: Stream.Stream<AgentChange>;
  readonly subscribe: Effect.Effect<PubSub.Subscription<AgentChange>, never, Scope.Scope>;
}

export class AgentNotifications extends Context.Service<
  AgentNotifications,
  AgentNotificationsShape
>()("agents/AgentNotifications") {}

const make = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<AgentChange>();
  return AgentNotifications.of({
    publish: (change) => PubSub.publish(pubsub, change).pipe(Effect.asVoid),
    changes: Stream.fromPubSub(pubsub),
    subscribe: PubSub.subscribe(pubsub),
  });
});

export const layer = Layer.effect(AgentNotifications, make);
