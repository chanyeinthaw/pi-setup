import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProtocolError } from "./domain.ts";

export const RpcRequest = Schema.Struct({
  id: Schema.String,
  method: Schema.String,
  params: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type RpcRequest = typeof RpcRequest.Type;

export const RpcResponse = Schema.Union([
  Schema.Struct({ id: Schema.String, success: Schema.Literal(true), result: Schema.Unknown }),
  Schema.Struct({ id: Schema.String, success: Schema.Literal(false), error: Schema.String }),
]);
export type RpcResponse = typeof RpcResponse.Type;

export const decodeRequest = Schema.decodeUnknownEffect(RpcRequest);
export const decodeResponse = Schema.decodeUnknownEffect(RpcResponse);
export const parseJson = (text: string) =>
  Effect.try({
    try: () => JSON.parse(text),
    catch: (cause) => new ProtocolError({ message: "Invalid JSON protocol message.", cause }),
  });
export const encodeJson = (value: unknown) => `${JSON.stringify(value)}\n`;
