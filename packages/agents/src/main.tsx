#!/usr/bin/env bun
/** @jsxImportSource @opentui/react */
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Effect from "effect/Effect";
import * as Command from "effect/unstable/cli/Command";
import { daemonCommand } from "./cli/daemon.ts";
import { runTui } from "./tui/main.tsx";

const root = Command.make("agents").pipe(
  Command.withHandler(() => Effect.promise(runTui)),
  Command.withSubcommands([daemonCommand]),
);

Command.run(root, { version: "0.1.0" }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
