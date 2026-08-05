import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { runtime } from "#src/effect-runtime.ts";

function shouldReturnFullMarkdown(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return (
    normalized.endsWith("SKILL.md") ||
    (normalized.includes("/skills/") && normalized.endsWith(".md")) ||
    (normalized.includes("skills/") && normalized.endsWith(".md"))
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event, ctx) =>
    Effect.gen(function* () {
      if (event.toolName !== "read") return;

      const input = event.input as { path?: string };
      const requestedPath = input.path;
      if (!requestedPath || !shouldReturnFullMarkdown(requestedPath)) return;

      const path = yield* Path.Path;
      const fileSystem = yield* FileSystem.FileSystem;
      const absolutePath = path.isAbsolute(requestedPath)
        ? requestedPath
        : path.resolve(ctx.cwd, requestedPath);
      const text = yield* fileSystem.readFileString(absolutePath);
      const existingDetails =
        event.details && typeof event.details === "object" && !Array.isArray(event.details)
          ? event.details
          : {};

      return {
        content: [{ type: "text" as const, text }],
        details: {
          ...existingDetails,
          path: absolutePath,
          forcedFullRead: true,
          chars: text.length,
          bytes: Buffer.byteLength(text, "utf8"),
        },
        isError: false,
      };
    }).pipe(runtime.runPromise),
  );
}
