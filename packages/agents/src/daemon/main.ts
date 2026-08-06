#!/usr/bin/env bun
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Effect from "effect/Effect";
import { launchDaemon } from "./launcher.ts";

launchDaemon.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
