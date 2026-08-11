import * as NodeSocket from "@effect/platform-node/NodeSocket";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
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
    options?: { readonly timeout?: number | false },
  ) => Effect.Effect<any, ProtocolError>;
  readonly subscribe: (
    params?: Record<string, unknown>,
  ) => Stream.Stream<AgentSnapshot | AgentNotification, ProtocolError>;
}

export const make = (socketPath: string): AgentClient => ({
  call: (method, params = {}, options = {}) => {
    const timeout = options.timeout ?? 1000;
    if (timeout !== false && (!Number.isFinite(timeout) || timeout <= 0))
      return Effect.fail(
        new ProtocolError({
          message: `Invalid timeout for ${method}: expected a finite positive number or false.`,
        }),
      );
    const request = Effect.scoped(
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
        const reader = yield* Effect.forkScoped(
          socket
            .runString((chunk) =>
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
              }).pipe(
                Effect.catch((cause) =>
                  Deferred.fail(
                    response,
                    new ProtocolError({
                      message: `Agent daemon RPC method ${method} at ${socketPath} failed while reading the response.`,
                      cause,
                    }),
                  ).pipe(Effect.asVoid),
                ),
              ),
            )
            .pipe(
              Effect.catch((cause) =>
                Deferred.fail(
                  response,
                  new ProtocolError({
                    message: `Agent daemon RPC method ${method} at ${socketPath} failed while reading the socket.`,
                    cause,
                  }),
                ).pipe(Effect.asVoid),
              ),
              Effect.andThen(
                Deferred.fail(
                  response,
                  new ProtocolError({
                    message: `Agent daemon RPC method ${method} at ${socketPath} closed before sending a complete response.`,
                  }),
                ).pipe(Effect.asVoid),
              ),
            ),
        );
        yield* write(encodeJson({ id: crypto.randomUUID(), method, params }));
        const awaiting = Deferred.await(response);
        return yield* (
          timeout === false
            ? awaiting
            : awaiting.pipe(
                Effect.timeoutOrElse({
                  duration: Duration.millis(timeout),
                  orElse: () =>
                    Effect.fail(
                      new ProtocolError({
                        message: `Agent daemon RPC method ${method} at ${socketPath} did not respond within ${formatTimeout(timeout)}.`,
                      }),
                    ),
                }),
              )
        ).pipe(Effect.ensuring(Fiber.interrupt(reader)));
      }),
    );
    return request.pipe(
      Effect.mapError((cause) =>
        cause instanceof ProtocolError
          ? cause
          : new ProtocolError({ message: "Agent socket operation failed.", cause }),
      ),
    );
  },
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

function formatTimeout(timeout: number): string {
  if (timeout === 1000) return "1 second";
  if (timeout < 1000) return `${timeout} milliseconds`;
  if (timeout % 1000 === 0) return `${timeout / 1000} seconds`;
  return `${timeout} milliseconds`;
}
