import { homedir } from "node:os";
import { join } from "node:path";

export function subagentStatePaths(piDir = process.env.PI_HOME ?? join(homedir(), ".pi")) {
  const root = join(piDir, "subagents");
  return {
    root,
    socket: join(root, "daemon.sock"),
    database: join(root, "subagents.db"),
    log: join(root, "daemon.log"),
  };
}
