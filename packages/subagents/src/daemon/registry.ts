import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { resolve } from "node:path";
import type { AgentRecord, AgentStatus, DeliveryRecord } from "../shared/domain.ts";
import { AgentError } from "../shared/domain.ts";
import type { TranscriptRecord } from "../shared/notifications.ts";
import { AgentNotifications } from "./notifications.ts";

export interface AgentRegistryShape {
  readonly insert: (agent: AgentRecord) => Effect.Effect<void, AgentError>;
  readonly attachSession: (
    id: string,
    sessionId?: string,
    sessionFile?: string,
  ) => Effect.Effect<void, AgentError>;
  readonly settle: (
    id: string,
    status: AgentStatus,
    finalText?: string,
    errorText?: string,
  ) => Effect.Effect<void, AgentError>;
  readonly appendMessage: (
    agentId: string,
    role: string,
    text: string,
  ) => Effect.Effect<void, AgentError>;
  readonly appendEvent: (
    agentId: string,
    type: string,
    payload: unknown,
  ) => Effect.Effect<void, AgentError>;
  readonly transcript: (agentId: string, limit?: number) => Effect.Effect<string, AgentError>;
  readonly transcriptItems: (
    agentId: string,
    limit?: number,
  ) => Effect.Effect<ReadonlyArray<TranscriptRecord>, AgentError>;
  readonly get: (ref: string) => Effect.Effect<AgentRecord | undefined, AgentError>;
  readonly list: (filters?: {
    parentSessionId?: string;
    cwd?: string;
    status?: string;
    query?: string;
  }) => Effect.Effect<ReadonlyArray<AgentRecord>, AgentError>;
  readonly pending: (
    parentSessionId: string,
  ) => Effect.Effect<ReadonlyArray<DeliveryRecord>, AgentError>;
  readonly ack: (deliveryId: string) => Effect.Effect<void, AgentError>;
  readonly consumeDelivery: (
    agentId: string,
    parentSessionId: string,
  ) => Effect.Effect<boolean, AgentError>;
}

export class AgentRegistry extends Context.Service<AgentRegistry, AgentRegistryShape>()(
  "agents/AgentRegistry",
) {}

const mapError = Effect.mapError(
  (cause: unknown) => new AgentError({ message: "Agent registry operation failed.", cause }),
);
const mapAgent = (row: any): AgentRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  prompt: row.prompt,
  cwd: row.cwd,
  parentSessionId: row.parent_session_id ?? undefined,
  parentSessionFile: row.parent_session_file ?? undefined,
  sessionId: row.session_id ?? undefined,
  sessionFile: row.session_file ?? undefined,
  model: row.model ?? undefined,
  thinking: row.thinking ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  settledAt: row.settled_at ?? undefined,
  finalText: row.final_text ?? undefined,
  errorText: row.error_text ?? undefined,
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const notifications = yield* AgentNotifications;
  yield* sql.unsafe(
    `CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, prompt TEXT NOT NULL, cwd TEXT NOT NULL, parent_session_id TEXT, parent_session_file TEXT, session_id TEXT, session_file TEXT, model TEXT, thinking TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, settled_at INTEGER, final_text TEXT, error_text TEXT)`,
  );
  yield* sql.unsafe(
    `CREATE TABLE IF NOT EXISTS transcript (sequence INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, timestamp INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL)`,
  );
  yield* sql.unsafe(
    `CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, timestamp INTEGER NOT NULL, event_type TEXT NOT NULL, payload_json TEXT NOT NULL)`,
  );
  yield* sql.unsafe(
    `CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, parent_session_id TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL, final_text TEXT, error_text TEXT, session_file TEXT, created_at INTEGER NOT NULL, delivered_at INTEGER)`,
  );
  yield* sql.unsafe(`UPDATE agents SET status='orphaned', updated_at=? WHERE status='running'`, [
    Date.now(),
  ]);

  const get = (ref: string) =>
    sql.unsafe<any>(`SELECT * FROM agents WHERE id=? OR slug=? LIMIT 1`, [ref, ref]).pipe(
      Effect.map((rows) => (rows[0] ? mapAgent(rows[0]) : undefined)),
      mapError,
    );
  const service: AgentRegistryShape = {
    insert: (a) =>
      sql
        .unsafe(
          `INSERT INTO agents (id,slug,name,prompt,cwd,parent_session_id,parent_session_file,session_id,session_file,model,thinking,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            a.id,
            a.slug,
            a.name,
            a.prompt,
            a.cwd,
            a.parentSessionId ?? null,
            a.parentSessionFile ?? null,
            a.sessionId ?? null,
            a.sessionFile ?? null,
            a.model ?? null,
            a.thinking ?? null,
            a.status,
            a.createdAt,
            a.updatedAt,
          ],
        )
        .pipe(
          Effect.andThen(notifications.publish({ type: "agent.created", agent: a })),
          Effect.asVoid,
          mapError,
        ),
    attachSession: (id, sessionId, sessionFile) =>
      Effect.gen(function* () {
        yield* sql.unsafe(`UPDATE agents SET session_id=?,session_file=?,updated_at=? WHERE id=?`, [
          sessionId ?? null,
          sessionFile ?? null,
          Date.now(),
          id,
        ]);
        const agent = yield* get(id);
        if (agent) yield* notifications.publish({ type: "agent.updated", agent });
      }).pipe(mapError),
    settle: (id, status, finalText, errorText) =>
      Effect.gen(function* () {
        const now = Date.now();
        yield* sql.unsafe(
          `UPDATE agents SET status=?,final_text=?,error_text=?,settled_at=?,updated_at=? WHERE id=?`,
          [status, finalText ?? null, errorText ?? null, now, now, id],
        );
        const a = yield* get(id);
        if (a) yield* notifications.publish({ type: "agent.updated", agent: a });
        if (a?.parentSessionId)
          yield* sql.unsafe(
            `INSERT INTO deliveries (id,agent_id,parent_session_id,slug,status,final_text,error_text,session_file,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            [
              crypto.randomUUID(),
              a.id,
              a.parentSessionId,
              a.slug,
              status,
              finalText ?? null,
              errorText ?? null,
              a.sessionFile ?? null,
              now,
            ],
          );
      }).pipe(mapError),
    appendMessage: (id, role, text) =>
      Effect.gen(function* () {
        const timestamp = Date.now();
        yield* sql.unsafe(
          `INSERT INTO transcript (agent_id,timestamp,role,text) VALUES (?,?,?,?)`,
          [id, timestamp, role, text],
        );
        const rows = yield* sql.unsafe<any>(`SELECT last_insert_rowid() AS sequence`);
        yield* notifications.publish({
          type: "transcript.appended",
          agentId: id,
          item: { sequence: rows[0].sequence, agentId: id, timestamp, role, text },
        });
      }).pipe(mapError),
    appendEvent: (id, type, payload) =>
      sql
        .unsafe(
          `INSERT INTO events (agent_id,timestamp,event_type,payload_json) VALUES (?,?,?,?)`,
          [id, Date.now(), type, JSON.stringify(payload)],
        )
        .pipe(Effect.asVoid, mapError),
    transcript: (id, limit) =>
      sql
        .unsafe<any>(
          `SELECT role,text FROM transcript WHERE agent_id=? AND text<>'' ORDER BY sequence ${limit ? "DESC LIMIT ?" : "ASC"}`,
          limit ? [id, limit] : [id],
        )
        .pipe(
          Effect.map((rows) => {
            const ordered = limit ? [...rows].reverse() : rows;
            return ordered.map((r: any) => `${r.role.toUpperCase()}\n${r.text}`).join("\n\n");
          }),
          mapError,
        ),
    transcriptItems: (id, limit) =>
      sql
        .unsafe<any>(
          `SELECT sequence,agent_id,timestamp,role,text FROM transcript WHERE agent_id=? AND text<>'' ORDER BY sequence ${limit ? "DESC LIMIT ?" : "ASC"}`,
          limit ? [id, limit] : [id],
        )
        .pipe(
          Effect.map((rows) =>
            (limit ? [...rows].reverse() : rows).map((row: any) => ({
              sequence: row.sequence,
              agentId: row.agent_id,
              timestamp: row.timestamp,
              role: row.role,
              text: row.text,
            })),
          ),
          mapError,
        ),
    get,
    list: (f = {}) => {
      const clauses: string[] = [];
      const p: unknown[] = [];
      if (f.parentSessionId) {
        clauses.push("parent_session_id=?");
        p.push(f.parentSessionId);
      }
      if (f.cwd) {
        clauses.push("cwd=?");
        p.push(resolve(f.cwd));
      }
      if (f.status) {
        clauses.push("status=?");
        p.push(f.status);
      }
      if (f.query) {
        clauses.push("(slug LIKE ? OR name LIKE ?)");
        p.push(`%${f.query}%`, `%${f.query}%`);
      }
      return sql
        .unsafe<any>(
          `SELECT * FROM agents ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC`,
          p,
        )
        .pipe(
          Effect.map((rows) => rows.map(mapAgent)),
          mapError,
        );
    },
    pending: (parent) =>
      sql
        .unsafe<any>(
          `SELECT * FROM deliveries WHERE parent_session_id=? AND delivered_at IS NULL ORDER BY created_at`,
          [parent],
        )
        .pipe(
          Effect.map((rows) =>
            rows.map((r: any) => ({
              id: r.id,
              agentId: r.agent_id,
              parentSessionId: r.parent_session_id,
              slug: r.slug,
              status: r.status,
              finalText: r.final_text ?? undefined,
              errorText: r.error_text ?? undefined,
              sessionFile: r.session_file ?? undefined,
              createdAt: r.created_at,
            })),
          ),
          mapError,
        ),
    ack: (id) =>
      sql
        .unsafe(`UPDATE deliveries SET delivered_at=? WHERE id=?`, [Date.now(), id])
        .pipe(Effect.asVoid, mapError),
    consumeDelivery: (agentId, parentSessionId) =>
      sql
        .unsafe<any>(
          `UPDATE deliveries SET delivered_at=? WHERE agent_id=? AND parent_session_id=? AND delivered_at IS NULL RETURNING id`,
          [Date.now(), agentId, parentSessionId],
        )
        .pipe(
          Effect.map((rows) => rows.length > 0),
          mapError,
        ),
  };
  return AgentRegistry.of(service);
});

export const layer = Layer.effect(AgentRegistry, make);
