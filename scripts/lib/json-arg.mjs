import fs from "node:fs";

export function readJsonFileArg(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(contents);
  } catch (err) {
    throw new Error(`failed to parse JSON from ${filePath}: ${err.message}`);
  }
}
