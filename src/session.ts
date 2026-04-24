import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

export async function resolveSessionPath(sessionId: string): Promise<string> {
  const wanted = `${sessionId}.jsonl`;
  const projects = await readdir(PROJECTS_DIR, { withFileTypes: true });
  for (const entry of projects) {
    if (!entry.isDirectory()) continue;
    const files = await readdir(join(PROJECTS_DIR, entry.name));
    if (files.includes(wanted)) {
      return join(PROJECTS_DIR, entry.name, wanted);
    }
  }
  throw new Error(
    `Session ${sessionId} not found under ${PROJECTS_DIR}. Check the ID.`,
  );
}

export async function readSessionLines(path: string): Promise<unknown[]> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const parsed: unknown[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Skip unparseable lines rather than aborting the replay.
    }
  }
  return parsed;
}
