import * as Schema from "effect/Schema";

export const AgentRecordSchema = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  prompt: Schema.String,
  cwd: Schema.String,
  parentSessionId: Schema.optional(Schema.String),
  parentSessionFile: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  sessionFile: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  thinking: Schema.optional(Schema.String),
  status: Schema.Literals(["running", "done", "error", "cancelled", "orphaned"]),
  createdAt: Schema.Finite,
  updatedAt: Schema.Finite,
  settledAt: Schema.optional(Schema.Finite),
  finalText: Schema.optional(Schema.String),
  errorText: Schema.optional(Schema.String),
});

export const TranscriptRecordSchema = Schema.Struct({
  sequence: Schema.Finite,
  agentId: Schema.String,
  timestamp: Schema.Finite,
  role: Schema.String,
  text: Schema.String,
});
export type TranscriptRecord = typeof TranscriptRecordSchema.Type;

export const AgentNotificationSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("agent.created"), agent: AgentRecordSchema }),
  Schema.Struct({ type: Schema.Literal("agent.updated"), agent: AgentRecordSchema }),
  Schema.Struct({
    type: Schema.Literal("transcript.appended"),
    agentId: Schema.String,
    item: TranscriptRecordSchema,
  }),
]);
export type AgentNotification = typeof AgentNotificationSchema.Type;
export type AgentChange = AgentNotification;

export const AgentSnapshotSchema = Schema.Struct({
  type: Schema.Literal("snapshot"),
  agents: Schema.Array(AgentRecordSchema),
  transcripts: Schema.Record(Schema.String, Schema.Array(TranscriptRecordSchema)),
});
export type AgentSnapshot = typeof AgentSnapshotSchema.Type;

export const AgentSubscriptionMessageSchema = Schema.Union([
  AgentSnapshotSchema,
  AgentNotificationSchema,
]);
export type AgentSubscriptionMessage = typeof AgentSubscriptionMessageSchema.Type;
export const decodeSubscriptionMessage = Schema.decodeUnknownEffect(AgentSubscriptionMessageSchema);
