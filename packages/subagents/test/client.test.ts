import { createServer, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { make } from "../src/shared/client.ts";
import { ProtocolError } from "../src/shared/domain.ts";

type Server = {
  path: string;
  acceptedCount: () => number;
  requestCount: () => number;
  closeCount: () => number;
  close: () => Promise<void>;
};

const startServer = async (handler: (socket: Socket, request: any) => void): Promise<Server> => {
  const directory = await mkdtemp(join(tmpdir(), "subagents-client-"));
  const path = join(directory, "daemon.sock");
  const sockets = new Set<Socket>();
  let closeCount = 0;
  let acceptedCount = 0;
  let requestCount = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    acceptedCount++;
    socket.on("close", () => {
      closeCount++;
      sockets.delete(socket);
    });
    let input = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      input += chunk;
      const newline = input.indexOf("\n");
      if (newline >= 0) {
        requestCount++;
        handler(socket, JSON.parse(input.slice(0, newline)));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  return {
    path,
    acceptedCount: () => acceptedCount,
    requestCount: () => requestCount,
    closeCount: () => closeCount,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
};

const response = (socket: Socket, request: any, result = { ok: true }) =>
  socket.write(`${JSON.stringify({ id: request.id, success: true, result })}\n`);

const waitFor = async (condition: () => boolean, timeout = 1000) => {
  const deadline = Date.now() + timeout;
  while (!condition() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.isTrue(condition());
};

it.live("uses the 1000ms default timeout", () =>
  Effect.gen(function* () {
    const server = yield* Effect.promise(() =>
      startServer((socket, request) => setTimeout(() => response(socket, request), 1600)),
    );
    try {
      const exit = yield* Effect.exit(make(server.path).call("slow"));
      yield* Effect.promise(() => waitFor(() => server.requestCount() >= 1));
      assert.isTrue(Exit.isFailure(exit));
      const error = (exit as any).cause.reasons[0].error;
      assert.instanceOf(error, ProtocolError);
      assert.include(error.message, "slow");
      assert.include(error.message, server.path);
      assert.include(error.message, "1 second");
    } finally {
      yield* Effect.promise(server.close);
    }
  }),
);

it.live("supports custom timeouts and reports timeout context", () =>
  Effect.gen(function* () {
    const server = yield* Effect.promise(() =>
      startServer((socket, request) => setTimeout(() => response(socket, request), 100)),
    );
    try {
      const client = make(server.path);
      const failure = yield* Effect.exit(client.call("agent.wait", {}, { timeout: 30 }));
      const success = yield* client.call("agent.wait", {}, { timeout: 500 });
      assert.isTrue(Exit.isFailure(failure));
      const error = (failure as any).cause.reasons[0].error;
      assert.instanceOf(error, ProtocolError);
      assert.include(error.message, "30 milliseconds");
      assert.deepEqual(success, { ok: true });
    } finally {
      yield* Effect.promise(server.close);
    }
  }),
);

it.live("allows false timeout to outlive the default boundary", () =>
  Effect.gen(function* () {
    const server = yield* Effect.promise(() =>
      startServer((socket, request) => setTimeout(() => response(socket, request), 1100)),
    );
    try {
      const result = yield* make(server.path).call("slow", {}, { timeout: false });
      assert.deepEqual(result, { ok: true });
    } finally {
      yield* Effect.promise(server.close);
    }
  }),
);

it.live("rejects invalid timeout values", () =>
  Effect.gen(function* () {
    const client = make(join(tmpdir(), "no-live-daemon.sock"));
    for (const timeout of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const exit = yield* Effect.exit(client.call("test", {}, { timeout }));
      assert.isTrue(Exit.isFailure(exit));
      assert.instanceOf((exit as any).cause.reasons[0].error, ProtocolError);
    }
  }),
);

it.live("closes timed out and interrupted sockets", () =>
  Effect.gen(function* () {
    const server = yield* Effect.promise(() => startServer(() => undefined));
    try {
      const client = make(server.path);
      const timed = yield* Effect.exit(client.call("timeout", {}, { timeout: 40 }));
      assert.isTrue(Exit.isFailure(timed));
      yield* Effect.promise(() => waitFor(() => server.requestCount() >= 1));
      const fiber = yield* Effect.forkScoped(client.call("never", {}, { timeout: false }));
      yield* Effect.promise(() => waitFor(() => server.acceptedCount() >= 2));
      yield* Effect.promise(() => waitFor(() => server.requestCount() >= 2));
      yield* Fiber.interrupt(fiber);
      yield* Effect.promise(() => waitFor(() => server.closeCount() >= 2));
      assert.isAtLeast(server.closeCount(), 2);
    } finally {
      yield* Effect.promise(server.close);
    }
  }),
);

it.live("reports clean EOF before a response", () =>
  Effect.gen(function* () {
    const server = yield* Effect.promise(() => startServer((socket) => socket.end()));
    try {
      const exit = yield* Effect.exit(make(server.path).call("eof", {}, { timeout: false }));
      assert.isTrue(Exit.isFailure(exit));
      const error = (exit as any).cause.reasons[0].error;
      assert.instanceOf(error, ProtocolError);
      assert.include(error.message, "eof");
      assert.include(error.message, server.path);
    } finally {
      yield* Effect.promise(server.close);
    }
  }),
);

it.live("preserves daemon errors", () =>
  Effect.gen(function* () {
    const server = yield* Effect.promise(() =>
      startServer((socket, request) =>
        socket.write(
          `${JSON.stringify({ id: request.id, success: false, error: "daemon exploded" })}\n`,
        ),
      ),
    );
    try {
      const exit = yield* Effect.exit(make(server.path).call("failed"));
      assert.isTrue(Exit.isFailure(exit));
      const error = (exit as any).cause.reasons[0].error;
      assert.instanceOf(error, ProtocolError);
      assert.equal(error.message, "daemon exploded");
    } finally {
      yield* Effect.promise(server.close);
    }
  }),
);
