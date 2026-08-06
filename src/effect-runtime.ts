import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

const nodeLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

export const runtime = ManagedRuntime.make(nodeLayer);
