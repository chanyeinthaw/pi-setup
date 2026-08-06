import { homedir } from "node:os";
import { join } from "node:path";

export function agentStatePaths(piDir = process.env.PI_HOME ?? join(homedir(), ".pi")) {
  const root = join(piDir, "agents");
  return {
    root,
    socket: join(root, "daemon.sock"),
    database: join(root, "agents.db"),
    log: join(root, "daemon.log"),
  };
}
