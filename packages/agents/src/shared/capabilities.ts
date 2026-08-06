export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type CapabilityName =
  | "agent.start"
  | "agent.find"
  | "agent.status"
  | "agent.send"
  | "agent.stop"
  | "agent.wait";

interface Capability {
  readonly name: CapabilityName;
  readonly description: string;
  readonly keywords: ReadonlyArray<string>;
  readonly required: ReadonlyArray<string>;
  readonly input: Readonly<Record<string, unknown>>;
}

const capabilities: ReadonlyArray<Capability> = [
  {
    name: "agent.start",
    description: "Start a persistent native Pi agent in the background.",
    keywords: ["start", "spawn", "background", "delegate", "work"],
    required: ["name", "prompt"],
    input: {
      name: { type: "string", description: "Short human-readable name." },
      prompt: { type: "string", description: "Self-contained task." },
      cwd: { type: "string", optional: true },
      model: { type: "string", optional: true },
      thinking: { enum: THINKING_LEVELS, optional: true },
    },
  },
  {
    name: "agent.find",
    description: "Find agents by parent session, project, name, or status.",
    keywords: ["find", "list", "search", "agents"],
    required: [],
    input: {
      scope: { enum: ["session", "project", "all"], optional: true },
      status: { type: "string", optional: true },
      query: { type: "string", optional: true },
    },
  },
  {
    name: "agent.status",
    description: "Inspect an agent's status and recent transcript activity.",
    keywords: ["status", "view", "inspect", "transcript", "activity"],
    required: ["agent"],
    input: {
      agent: { type: "string" },
      transcript: { enum: ["none", "recent", "full"], optional: true },
    },
  },
  {
    name: "agent.send",
    description: "Steer a running agent or continue a settled agent.",
    keywords: ["send", "steer", "prompt", "continue", "follow up"],
    required: ["agent", "message"],
    input: { agent: { type: "string" }, message: { type: "string" } },
  },
  {
    name: "agent.stop",
    description: "Cancel a running agent.",
    keywords: ["stop", "cancel", "abort", "interrupt"],
    required: ["agent"],
    input: { agent: { type: "string" } },
  },
  {
    name: "agent.wait",
    description:
      "Wait for one agent to settle and retrieve its result immediately if already finished.",
    keywords: ["result", "wait", "finish", "output", "collect"],
    required: ["agent"],
    input: { agent: { type: "string" } },
  },
];

export interface DiscoveredCapability {
  readonly name: CapabilityName;
  readonly description: string;
  readonly required?: ReadonlyArray<string>;
  readonly input?: Readonly<Record<string, unknown>>;
}

export function discoverCapabilities(query?: string): DiscoveredCapability[] {
  if (!query?.trim()) {
    return capabilities.map(({ name, description }) => ({ name, description }));
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = capabilities
    .map((capability) => ({
      capability,
      score: terms.reduce((score, term) => {
        const haystack = [capability.name, capability.description, ...capability.keywords]
          .join(" ")
          .toLowerCase();
        return score + (haystack.includes(term) ? 1 : 0);
      }, 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
  const bestScore = ranked[0]?.score;
  return ranked
    .filter(({ score }) => score === bestScore)
    .map(({ capability }) => ({
      name: capability.name,
      description: capability.description,
      required: capability.required,
      input: capability.input,
    }));
}

export function parseExecution(
  capabilityName: string,
  args: Readonly<Record<string, unknown>>,
): { readonly capability: CapabilityName; readonly arguments: Readonly<Record<string, unknown>> } {
  const capability = capabilities.find(({ name }) => name === capabilityName);
  if (!capability) throw new Error(`Unknown agent capability "${capabilityName}".`);
  const missing = capability.required.filter((key) => {
    const value = args[key];
    return value === undefined || value === null || value === "";
  });
  if (missing.length > 0) {
    throw new Error(`${capability.name} requires: ${missing.join(", ")}.`);
  }
  return { capability: capability.name, arguments: args };
}
