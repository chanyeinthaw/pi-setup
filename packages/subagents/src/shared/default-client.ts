import { make } from "./client.ts";
import { subagentStatePaths } from "./paths.ts";

export const defaultClient = make(subagentStatePaths().socket);
