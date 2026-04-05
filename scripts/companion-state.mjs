import os from "node:os";
import path from "node:path";

export function resolveDefaultStateDir() {
  if (process.env.OTH_SKILLS_STATE_DIR) {
    return process.env.OTH_SKILLS_STATE_DIR;
  }

  if (process.env.XDG_STATE_HOME) {
    return path.join(process.env.XDG_STATE_HOME, "0th-skills", "reviews");
  }

  return path.join(os.homedir(), ".0th", "reviews");
}
