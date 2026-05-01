export type PlayEvent =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | {
      kind: "tool";
      name: string;
      input: Record<string, unknown>;
      resultText?: string;
    }
  | { kind: "notification"; summary: string; status: string };

export interface SessionMeta {
  cwd?: string;
  model?: string;
  version?: string;
  agent?: string;
  agentColor?: string; // hex, used for the agent pill
  userName?: string;
  organizationName?: string;
}

export interface NormalizedSession {
  meta: SessionMeta;
  events: PlayEvent[];
}

type RawBlock = {
  type: string;
  id?: string;
  tool_use_id?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
};
type RawEntry = {
  type?: string;
  isMeta?: boolean;
  cwd?: string;
  version?: string;
  agentSetting?: string;
  organizationName?: string;
  message?: {
    role?: string;
    model?: string;
    content?: string | RawBlock[];
  };
};

function isSlashCommandArtifact(s: string): boolean {
  return /^<(local-command-[a-z]+|command-[a-z]+)\b/i.test(s.trim());
}

function parseTaskNotification(
  s: string,
): { summary: string; status: string } | null {
  if (!/^<task-notification>/i.test(s.trim())) return null;
  const summary = /<summary>([\s\S]*?)<\/summary>/i.exec(s)?.[1]?.trim() ?? "";
  const status = /<status>([\s\S]*?)<\/status>/i.exec(s)?.[1]?.trim() ?? "";
  return { summary, status };
}

function extractResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (!c || typeof c !== "object") return "";
        const obj = c as { type?: string; text?: string };
        if (obj.type === "text" && typeof obj.text === "string") return obj.text;
        return "";
      })
      .join("\n");
  }
  return "";
}

export interface EventFilters {
  excludeUser?: string[];
  excludeAssistant?: string[];
  excludeTools?: string[];
  excludeToolInput?: string[];
}

function compilePatterns(pats?: string[]): RegExp[] | undefined {
  if (!pats || pats.length === 0) return undefined;
  return pats.map((p) => new RegExp(p, "i"));
}

function matchesAny(text: string, regexes: RegExp[] | undefined): boolean {
  if (!regexes) return false;
  return regexes.some((r) => r.test(text));
}

export function normalize(
  rawEntries: unknown[],
  filters?: EventFilters,
): NormalizedSession {
  const excludeUser = compilePatterns(filters?.excludeUser);
  const excludeAssistant = compilePatterns(filters?.excludeAssistant);
  const excludeTools = new Set(filters?.excludeTools ?? []);
  const excludeToolInput = compilePatterns(filters?.excludeToolInput);
  const meta: SessionMeta = {};
  const results = new Map<string, string>();

  // Pass 1: collect tool results by tool_use_id and meta.
  for (const raw of rawEntries) {
    const entry = raw as RawEntry;
    if (!entry || typeof entry !== "object") continue;
    if (!meta.cwd && typeof entry.cwd === "string") meta.cwd = entry.cwd;
    if (!meta.version && typeof entry.version === "string")
      meta.version = entry.version;
    if (!meta.model && typeof entry.message?.model === "string")
      meta.model = entry.message.model;
    if (!meta.agent && typeof entry.agentSetting === "string")
      meta.agent = entry.agentSetting;
    if (
      !meta.organizationName &&
      typeof entry.organizationName === "string"
    )
      meta.organizationName = entry.organizationName;

    if (entry.type !== "user") continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_result" && typeof block.tool_use_id === "string") {
        results.set(block.tool_use_id, extractResultText(block.content));
      }
    }
  }

  // Pass 2: emit play events.
  const events: PlayEvent[] = [];
  for (const raw of rawEntries) {
    const entry = raw as RawEntry;
    if (!entry || typeof entry !== "object") continue;
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (entry.isMeta) continue;

    const content = entry.message?.content;

    if (entry.type === "user") {
      if (typeof content !== "string") continue;
      const trimmed = content.trim();
      if (!trimmed || isSlashCommandArtifact(trimmed)) continue;
      const notif = parseTaskNotification(trimmed);
      if (notif) {
        events.push({ kind: "notification", ...notif });
        continue;
      }
      if (matchesAny(trimmed, excludeUser)) continue;
      events.push({ kind: "user", text: trimmed });
      continue;
    }

    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        const text = block.text.trim();
        if (!text) continue;
        if (matchesAny(text, excludeAssistant)) continue;
        events.push({ kind: "assistant", text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        if (excludeTools.has(block.name)) continue;
        if (excludeToolInput && matchesAny(JSON.stringify(block.input), excludeToolInput)) continue;
        const resultText =
          typeof block.id === "string" ? results.get(block.id) : undefined;
        events.push({
          kind: "tool",
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
          resultText,
        });
      }
    }
  }

  return { meta, events };
}
