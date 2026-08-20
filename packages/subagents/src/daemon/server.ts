import * as NodeSocketServer from "@effect/platform-node/NodeSocketServer";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Socket from "effect/unstable/socket/Socket";
import { resolve } from "node:path";
import { AgentError } from "../shared/domain.ts";
import { AgentManager } from "./agent-manager.ts";
import { AgentNotifications } from "./notifications.ts";
import { AgentRegistry } from "./registry.ts";
import { decodeRequest, encodeJson, parseJson, type RpcResponse } from "../shared/protocol.ts";

export const dispatch = (method: string, params: any) =>
  Effect.gen(function* () {
    const manager = yield* AgentManager;
    const registry = yield* AgentRegistry;
    switch (method) {
      case "daemon.status":
        return { ready: true };
      case "agent.start":
        return { agent: yield* manager.start(params) };
      case "agent.list":
        return { agents: yield* registry.list(params) };
      case "agent.snapshot": {
        const agents = yield* registry.list(params);
        const entries = yield* Effect.forEach(agents, (agent) =>
          registry
            .transcriptItems(agent.id)
            .pipe(Effect.map((items) => [agent.id, items] as const)),
        );
        return {
          type: "snapshot",
          agents,
          transcripts: Object.fromEntries(entries),
        };
      }
      case "agent.get": {
        const agent = yield* manager.require(params.agent);
        const transcript =
          params.transcript === "none"
            ? undefined
            : yield* registry.transcript(agent.id, params.transcript === "recent" ? 20 : undefined);
        return { agent, transcript };
      }
      case "agent.send":
        return { agent: yield* manager.send(params.agent, params.message) };
      case "agent.cancel":
        return { agent: yield* manager.stop(params.agent) };
      case "agent.wait": {
        const agent = yield* manager.wait(params.agent);
        const deliveryConsumed = params.parentSessionId
          ? yield* registry.consumeDelivery(agent.id, params.parentSessionId)
          : false;
        return { agent, deliveryConsumed };
      }
      case "delivery.pending":
        return { deliveries: yield* registry.pending(params.parentSessionId) };
      case "delivery.ack":
        yield* registry.ack(params.deliveryId);
        return { acknowledged: true };
      default:
        return yield* new AgentError({ message: `Unknown daemon method "${method}".` });
    }
  });

const handleLine = (line: string) =>
  Effect.gen(function* () {
    const unknown = yield* parseJson(line);
    const request = yield* decodeRequest(unknown);
    const result = yield* dispatch(request.method, request.params ?? {});
    return { id: request.id, success: true, result } satisfies RpcResponse;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        id: "",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RpcResponse),
    ),
  );

const handleSocket = (socket: Socket.Socket) =>
  Effect.scoped(
    Effect.gen(function* () {
      const write = yield* socket.writer;
      let buffer = "";
      return yield* socket.runString((chunk) =>
        Effect.gen(function* () {
          buffer += chunk;
          while (true) {
            const newline = buffer.indexOf("\n");
            if (newline < 0) break;
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const unknown = yield* parseJson(line);
            const request = yield* decodeRequest(unknown);
            if (request.method === "agent.subscribe") {
              const registry = yield* AgentRegistry;
              const notifications = yield* AgentNotifications;
              const subscription = yield* notifications.subscribe;
              const rawFilters = (request.params ?? {}) as Record<string, unknown>;
              const cwdFilter =
                typeof rawFilters.cwd === "string" ? resolve(rawFilters.cwd) : undefined;
              const parentFilter =
                typeof rawFilters.parentSessionId === "string"
                  ? rawFilters.parentSessionId
                  : undefined;
              const statusFilter =
                typeof rawFilters.status === "string" ? rawFilters.status : undefined;
              const queryFilter =
                typeof rawFilters.query === "string"
                  ? rawFilters.query.toLowerCase()
                  : undefined;
              const filters: Record<string, unknown> = { ...rawFilters };
              if (cwdFilter) filters.cwd = cwdFilter;
              else delete (filters as any).cwd;
              const agents = yield* registry.list(filters as any);
              const entries = yield* Effect.forEach(agents, (agent) =>
                registry
                  .transcriptItems(agent.id)
                  .pipe(Effect.map((items) => [agent.id, items] as const)),
              );
              yield* write(
                encodeJson({
                  type: "snapshot",
                  agents,
                  transcripts: Object.fromEntries(entries),
                }),
              );
              const visibleIds = new Set(agents.map((a) => a.id));
              const matchesCwd = (agentCwd: string) =>
                !cwdFilter || resolve(agentCwd) === cwdFilter;
              const matchesParent = (parentSessionId?: string) =>
                !parentFilter || parentSessionId === parentFilter;
              const matchesStatus = (status: string) =>
                !statusFilter || status === statusFilter;
              const matchesQuery = (agent: { slug: string; name: string }) =>
                !queryFilter ||
                agent.slug.toLowerCase().includes(queryFilter) ||
                agent.name.toLowerCase().includes(queryFilter);
              while (true) {
                const msg = yield* PubSub.take(subscription);
                if (msg.type === "agent.created" || msg.type === "agent.updated") {
                  if (!matchesCwd(msg.agent.cwd)) continue;
                  if (!matchesParent(msg.agent.parentSessionId)) continue;
                  if (!matchesStatus(msg.agent.status)) continue;
                  if (!matchesQuery(msg.agent)) continue;
                  visibleIds.add(msg.agent.id);
                } else if (msg.type === "transcript.appended") {
                  if (!visibleIds.has(msg.agentId)) continue;
                }
                yield* write(encodeJson(msg));
              }
            }
            const response = yield* handleLine(line);
            yield* write(encodeJson(response));
          }
        }),
      );
    }),
  );

export const serve = (socketPath: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* NodeSocketServer.make({ path: socketPath });
      const fiber = yield* Effect.forkScoped(server.run(handleSocket));
      return yield* Fiber.join(fiber);
    }),
  );
