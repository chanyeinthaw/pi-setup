import { NodeFileSystem, NodePath } from "@effect/platform-node";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

export const runtime = ManagedRuntime.make(nodeLayer);
