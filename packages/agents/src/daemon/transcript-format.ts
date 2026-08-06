import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";

export function formatUserTranscript(message: Message): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        !!part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function formatAssistantTranscript(message: AssistantMessage): string {
  const sections: string[] = [];
  for (const part of message.content) {
    if (part.type === "text" && part.text.trim()) {
      sections.push(part.text.trim());
    } else if (part.type === "thinking" && !part.redacted && part.thinking.trim()) {
      sections.push(`THINKING\n${part.thinking.trim()}`);
    } else if (part.type === "toolCall") {
      sections.push(`TOOL CALL ${part.name}\n${safeJson(part.arguments)}`);
    }
  }
  return sections.join("\n\n");
}

export function formatToolTranscript(message: ToolResultMessage): string {
  const output = message.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  return `${message.toolName} [${message.isError ? "error" : "success"}]${output ? `\n${output}` : ""}`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
