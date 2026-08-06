import { agentStatePaths } from "./paths.ts";
import { make } from "./client.ts";

export const defaultClient = make(agentStatePaths().socket);
