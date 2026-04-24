export type PlayEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; input: Record<string, unknown> };

export interface SessionMeta {
  cwd?: string;
  model?: string;
  version?: string;
}

export interface NormalizedSession {
  meta: SessionMeta;
  events: PlayEvent[];
}

type RawBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
};
type RawEntry = {
  type?: string;
  isMeta?: boolean;
  cwd?: string;
  version?: string;
  message?: {
    role?: string;
    model?: string;
    content?: string | RawBlock[];
  };
};

function isSlashCommandArtifact(s: string): boolean {
  return /^<(local-command-[a-z]+|command-[a-z]+)\b/i.test(s.trim());
}

export function normalize(rawEntries: unknown[]): NormalizedSession {
  const events: PlayEvent[] = [];
  const meta: SessionMeta = {};

  for (const raw of rawEntries) {
    const entry = raw as RawEntry;
    if (!entry || typeof entry !== "object") continue;

    if (!meta.cwd && typeof entry.cwd === "string") meta.cwd = entry.cwd;
    if (!meta.version && typeof entry.version === "string")
      meta.version = entry.version;
    if (!meta.model && typeof entry.message?.model === "string")
      meta.model = entry.message.model;

    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (entry.isMeta) continue;

    const content = entry.message?.content;

    if (entry.type === "user") {
      if (typeof content !== "string") continue;
      const trimmed = content.trim();
      if (!trimmed || isSlashCommandArtifact(trimmed)) continue;
      events.push({ kind: "user", text: trimmed });
      continue;
    }

    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        const text = block.text.trim();
        if (text) events.push({ kind: "assistant", text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        events.push({
          kind: "tool",
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }
  }

  return { meta, events };
}
