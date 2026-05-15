import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import path from "node:path";

function shouldReturnFullMarkdown(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  return (
    normalized.endsWith("SKILL.md") ||
    (normalized.includes("/skills/") && normalized.endsWith(".md")) ||
    (normalized.includes("skills/") && normalized.endsWith(".md"))
  );
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "read") return;

    const input = event.input as { path?: string };
    if (!input.path || !shouldReturnFullMarkdown(input.path)) return;

    const absolutePath = path.isAbsolute(input.path)
      ? input.path
      : path.resolve(ctx.cwd, input.path);

    const text = await readFile(absolutePath, "utf8");

    return {
      content: [{ type: "text" as const, text }],
      details: {
        ...(event.details ?? {}),
        path: absolutePath,
        forcedFullRead: true,
        chars: text.length,
        bytes: Buffer.byteLength(text, "utf8"),
      },
      isError: false,
    };
  });
}
