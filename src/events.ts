export type PlayEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string };

type RawBlock = { type: string; text?: string; name?: string };
type RawEntry = {
  type?: string;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: string | RawBlock[];
  };
};

function stripWrapped(s: string): string {
  // Slash-command artifacts: <command-name>, <local-command-stdout>, etc.
  // If the entire message is one of these synthetic tags, drop it.
  const trimmed = s.trim();
  if (/^<(local-command-[a-z]+|command-[a-z]+)\b/i.test(trimmed)) return "";
  return trimmed;
}

export function normalize(rawEntries: unknown[]): PlayEvent[] {
  const events: PlayEvent[] = [];

  for (const raw of rawEntries) {
    const entry = raw as RawEntry;
    if (!entry || typeof entry !== "object") continue;
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (entry.isMeta) continue;

    const content = entry.message?.content;

    if (entry.type === "user") {
      // Tool results come back as arrays — skip entirely.
      if (typeof content !== "string") continue;
      const text = stripWrapped(content);
      if (!text) continue;
      events.push({ kind: "user", text });
      continue;
    }

    // assistant
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        const text = block.text.trim();
        if (text) events.push({ kind: "assistant", text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        events.push({ kind: "tool", name: block.name });
      }
      // thinking blocks: skipped
    }
  }

  return events;
}
