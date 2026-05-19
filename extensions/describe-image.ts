import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

interface DescribeImageConfig {
  model?: string; // "provider/model-id"
}

function readDescribeImageConfig(): DescribeImageConfig {
  try {
    if (!existsSync(SETTINGS_PATH)) return {};
    const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    if (raw && typeof raw.describe_image === "object" && !Array.isArray(raw.describe_image)) {
      return raw.describe_image as DescribeImageConfig;
    }
  } catch {
    // settings.json is user-edited; don't crash the extension
  }
  return {};
}

// ---------------------------------------------------------------------------
// Image → temp file helpers
// ---------------------------------------------------------------------------

const TMP_DIR = join(homedir(), ".pi", "tmp");

function ensureTmpDir(): void {
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }
}

function saveImageToTempFile(data: string, mimeType: string): string {
  ensureTmpDir();
  const ext = mimeTypeToExt(mimeType);
  const filename = `describe-image-${randomUUID().slice(0, 8)}${ext}`;
  const filepath = join(TMP_DIR, filename);
  const buffer = Buffer.from(data, "base64");
  writeFileSync(filepath, buffer);
  return filepath;
}

function mimeTypeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/png":  return ".png";
    case "image/jpeg":
    case "image/jpg":  return ".jpg";
    case "image/gif":  return ".gif";
    case "image/webp": return ".webp";
    default:           return ".png";
  }
}

function deleteTempFile(filepath: string): void {
  try {
    if (existsSync(filepath)) unlinkSync(filepath);
  } catch {
    // best-effort cleanup
  }
}

function guessMimeType(filepath: string): string {
  if (filepath.endsWith(".png"))  return "image/png";
  if (filepath.endsWith(".jpg") || filepath.endsWith(".jpeg")) return "image/jpeg";
  if (filepath.endsWith(".gif"))  return "image/gif";
  if (filepath.endsWith(".webp")) return "image/webp";
  return "image/png";
}

// ---------------------------------------------------------------------------
// Vision model call via pi-ai
// ---------------------------------------------------------------------------

interface AuthResult {
  apiKey: string;
  headers?: Record<string, string>;
}

async function resolveModelAuth(
  modelRegistry: ExtensionContext["modelRegistry"],
  model: any,
  sessionId?: string,
): Promise<AuthResult | undefined> {
  const registry = modelRegistry as any;

  if (typeof registry.getApiKeyAndHeaders === "function") {
    const result = await registry.getApiKeyAndHeaders(model);
    if (result?.ok && result.apiKey) {
      return { apiKey: result.apiKey, headers: result.headers };
    }
    return undefined;
  }

  if (typeof registry.getApiKey === "function") {
    const apiKey = await registry.getApiKey(model, sessionId);
    if (apiKey) {
      return { apiKey, headers: model.headers };
    }
    return undefined;
  }

  return undefined;
}

async function describeImageWithModel(
  model: any,
  auth: AuthResult,
  imagePath: string,
  question: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const { complete } = await import("@earendil-works/pi-ai");

  const imageBuffer = readFileSync(imagePath);
  const mimeType = guessMimeType(imagePath);

  const text = question
    ? `The user attached an image with this question: "${question}"\n\nDescribe the image in detail, answering the user's question.`
    : "Describe this image in detail. Include objects, people, text, colors, layout, and any notable elements.";

  const response = await complete(
    model,
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text },
            {
              type: "image",
              data: imageBuffer.toString("base64"),
              mimeType,
            },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      signal,
    },
  );

  const textContent = response.content.find(
    (c): c is { type: "text"; text: string } => c.type === "text",
  );
  if (textContent) return textContent.text;

  // Fallback: extract from thinking content
  const thinkingContent = response.content.find(
    (c): c is { type: "thinking"; thinking: string } => c.type === "thinking",
  );
  if (thinkingContent) return thinkingContent.thinking;

  return "(no description returned)";
}

// ---------------------------------------------------------------------------
// Temp file cleanup tracking
// ---------------------------------------------------------------------------

const pendingFiles = new Set<string>();

function trackTempFile(filepath: string): void {
  pendingFiles.add(filepath);
}

function untrackTempFile(filepath: string): void {
  pendingFiles.delete(filepath);
}

function cleanupAllTempFiles(): void {
  for (const fp of pendingFiles) {
    deleteTempFile(fp);
  }
  pendingFiles.clear();
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function describeImageExtension(pi: ExtensionAPI) {
  // Clean up temp files on session shutdown
  pi.on("session_shutdown", () => {
    cleanupAllTempFiles();
  });

  // Inject system prompt hint when images are attached to a non-vision model
  pi.on("before_agent_start", (event, ctx) => {
    if (!event.images || event.images.length === 0) return;
    if (!ctx.model) return;
    if (ctx.model.input.includes("image")) return; // model already supports vision

    const config = readDescribeImageConfig();
    if (!config.model) return; // not configured, can't help

    // Save attached images to temp files so the LLM can reference them
    const savedPaths: string[] = [];
    for (const img of event.images) {
      const filepath = saveImageToTempFile(img.data, img.mimeType);
      savedPaths.push(filepath);
      trackTempFile(filepath);
    }

    // Inject hint into system prompt
    const pathList = savedPaths.map((p) => `  - ${p}`).join("\n");
    const hint =
      `\n\nThe user attached one or more images. Your current model does not support vision, ` +
      `but you can use the \`describe_image\` tool to analyze them.\n` +
      `Saved image paths:\n${pathList}\n` +
      `Call \`describe_image\` with a path and the user's question (or ask the user what they'd like to know).`;

    return {
      systemPrompt: event.systemPrompt + hint,
    };
  });

  // Register the tool
  pi.registerTool(
    defineTool({
      name: "describe_image",
      label: "Describe Image",
      description:
        "Describe the visual content of an image file. Call this when the user asks about " +
        "an image, or when `read` says 'model does not support images'. " +
        "Provide the file path and optionally the user's specific question.",
      parameters: Type.Object({
        path: Type.String({ description: "Path to the image file on disk" }),
        question: Type.Optional(
          Type.String({ description: "Optional question about the image to answer" }),
        ),
      }),
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const { path, question } = params;

        // 1. Check file exists
        if (!existsSync(path)) {
          return {
            content: [{ type: "text", text: `Error: File not found at: ${path}` }],
            details: { error: "file_not_found" },
            isError: true,
          };
        }

        // 2. Read config
        const config = readDescribeImageConfig();
        const modelRef = config.model;
        if (!modelRef) {
          return {
            content: [
              {
                type: "text",
                text:
                  "Error: `describe_image` is not configured. " +
                  'Add `"describe_image": { "model": "provider/model-id" }` ' +
                  "to your `~/.pi/agent/settings.json`.",
              },
            ],
            details: { error: "not_configured" },
            isError: true,
          };
        }

        // 3. Parse provider/model-id
        const slashIdx = modelRef.indexOf("/");
        if (slashIdx === -1) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Error: Invalid model reference "${modelRef}". ` +
                  'Use the format "provider/model-id".',
              },
            ],
            details: { error: "invalid_model_ref" },
            isError: true,
          };
        }
        const provider = modelRef.slice(0, slashIdx);
        const modelId = modelRef.slice(slashIdx + 1);

        // 4. Find the vision model
        const visionModel = ctx.modelRegistry.find(provider, modelId);
        if (!visionModel) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Model "${modelRef}" not found. ` +
                  "Make sure the model is configured in Pi and has a valid API key.",
              },
            ],
            details: { error: "model_not_found" },
            isError: true,
          };
        }

        // 5. Resolve API key / auth
        const sessionId = ctx.sessionManager.getSessionId();
        const auth = await resolveModelAuth(ctx.modelRegistry, visionModel, sessionId);
        if (!auth?.apiKey) {
          return {
            content: [
              {
                type: "text",
                text: `Error: No API key available for model "${modelRef}".`,
              },
            ],
            details: { error: "no_api_key" },
            isError: true,
          };
        }

        // 6. Call the vision model
        onUpdate?.({ content: [{ type: "text", text: "Analyzing image…" }], details: {} });

        try {
          const description = await describeImageWithModel(
            visionModel,
            auth,
            path,
            question,
            signal,
          );

          // 7. Clean up temp file if it was one of ours
          untrackTempFile(path);
          deleteTempFile(path);

          return {
            content: [{ type: "text", text: description }],
            details: { model: modelRef },
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Error describing image: ${msg}` }],
            details: { error: "description_failed" },
            isError: true,
          };
        }
      },
    }),
  );
}
