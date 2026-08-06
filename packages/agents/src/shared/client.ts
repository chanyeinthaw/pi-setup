import * as NodeSocket from "@effect/platform-node/NodeSocket";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as SocketModules from "effect/unstable/socket";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { ProtocolError } from "./domain.ts";
import {
  decodeSubscriptionMessage,
  type AgentNotification,
  type AgentSnapshot,
} from "./notifications.ts";
import { decodeResponse, encodeJson, parseJson } from "./protocol.ts";

// Keep the public socket barrel in Bun's compiled module graph. Importing only
// NodeSocket can otherwise leave Effect's Socket service partially initialized.
const socketService = SocketModules.Socket.Socket;
void socketService;

export interface AgentClient {
  readonly call: (
    method: string,
    params?: Record<string, unknown>,
  ) => Effect.Effect<any, ProtocolError>;
  readonly subscribe: (
    params?: Record<string, unknown>,
  ) => Stream.Stream<AgentSnapshot | AgentNotification, ProtocolError>;
}

export const make = (socketPath: string): AgentClient => ({
  call: (method, params = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const socket = yield* NodeSocket.makeNet({ path: socketPath }).pipe(
          Effect.mapError(
            (cause) =>
              new ProtocolError({
                message: `Cannot connect to agent daemon at ${socketPath}.`,
                cause,
              }),
          ),
        );
        const write = yield* socket.writer;
        const response = yield* Deferred.make<any, ProtocolError>();
        let buffer = "";
        yield* Effect.forkScoped(
          socket.runString((chunk) =>
            Effect.gen(function* () {
              buffer += chunk;
              const newline = buffer.indexOf("\n");
              if (newline < 0) return;
              const unknown = yield* parseJson(buffer.slice(0, newline));
              const decoded = yield* decodeResponse(unknown).pipe(
                Effect.mapError(
                  (cause) => new ProtocolError({ message: "Invalid daemon response.", cause }),
                ),
              );
              if (decoded.success) yield* Deferred.succeed(response, decoded.result);
              else yield* Deferred.fail(response, new ProtocolError({ message: decoded.error }));
            }).pipe(Effect.catch((error) => Deferred.fail(response, error).pipe(Effect.asVoid))),
          ),
        );
        yield* write(encodeJson({ id: crypto.randomUUID(), method, params }));
        return yield* Deferred.await(response);
      }),
    ).pipe(
      Effect.mapError((cause) =>
        cause instanceof ProtocolError
          ? cause
          : new ProtocolError({ message: "Agent socket operation failed.", cause }),
      ),
    ),
  subscribe: (params = {}) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const socket = yield* NodeSocket.makeNet({ path: socketPath }).pipe(
          Effect.mapError(
            (cause) =>
              new ProtocolError({
                message: `Cannot connect to agent daemon at ${socketPath}.`,
                cause,
              }),
          ),
        );
        const write = yield* socket.writer;
        const queue = yield* Queue.unbounded<AgentSnapshot | AgentNotification, ProtocolError>();
        let buffer = "";
        yield* Effect.forkScoped(
          socket
            .runString((chunk) =>
              Effect.gen(function* () {
                buffer += chunk;
                while (true) {
                  const newline = buffer.indexOf("\n");
                  if (newline < 0) break;
                  const line = buffer.slice(0, newline).replace(/\r$/, "");
                  buffer = buffer.slice(newline + 1);
                  if (!line) continue;
                  const unknown = yield* parseJson(line);
                  const message = yield* decodeSubscriptionMessage(unknown).pipe(
                    Effect.mapError(
                      (cause) =>
                        new ProtocolError({ message: "Invalid daemon notification.", cause }),
                    ),
                  );
                  yield* Queue.offer(queue, message);
                }
              }),
            )
            .pipe(
              Effect.catch((cause) =>
                Queue.fail(
                  queue,
                  cause instanceof ProtocolError
                    ? cause
                    : new ProtocolError({ message: "Agent subscription failed.", cause }),
                ),
              ),
            ),
        );
        yield* write(encodeJson({ id: crypto.randomUUID(), method: "agent.subscribe", params }));
        return Stream.fromQueue(queue);
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof ProtocolError
            ? cause
            : new ProtocolError({ message: "Agent subscription failed.", cause }),
        ),
      ),
    ),
});
