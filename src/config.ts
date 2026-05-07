import { existsSync, readFileSync } from "node:fs";

export interface EventFilters {
  /** Regex patterns (case-insensitive) tested against user message text. */
  excludeUser?: string[];
  /** Regex patterns (case-insensitive) tested against assistant message text. */
  excludeAssistant?: string[];
  /** Tool names to drop entirely, e.g. `["Bash"]`. */
  excludeTools?: string[];
  /** Regex patterns (case-insensitive) tested against stringified tool input.
   *  Matches drop the individual tool event. */
  excludeToolInput?: string[];
  /** Regex patterns (case-insensitive) tested against notification summary/status. */
  excludeNotifications?: string[];
  /** Regex pattern tested against assistant text; stops the session after
   *  the first matching message (inclusive). */
  stopAfterAssistant?: string;
}

export interface PlayerConfig {
  sessionId: string;
  user?: string;
  agent?: {
    name?: string;
    color?: string; // hex (#d97757) or named (orange/blue/green/purple/red/yellow)
  };
  speed?: {
    wpm?: number;
    turnDelayMs?: number;
    toolDelayMs?: number;
    thinkMs?: number;
  };
  tools?: {
    /** Render tool bullet/name/args dimmed so they don't outshine messages. */
    dim?: boolean;
    /** Consecutive tool events ≥ this count are treated as a "run" and
     *  sped up. 0 disables the speedup (default 3). */
    runThreshold?: number;
    /** Delay between tools within a run (default 80ms, overrides toolDelayMs). */
    runToolDelayMs?: number;
    /** Skip the inter-tool thinking spinner within a run (default true). */
    runSkipSpinner?: boolean;
    /** Inside a tool run, show at most this many tools then collapse the rest
     *  into a "+N tools" line.  0 disables collapsing (default 0). */
    collapseThreshold?: number;
  };
  filters?: EventFilters;
}

export const NAMED_COLORS: Record<string, string> = {
  orange: "#d97757",
  blue: "#7c8cde",
  green: "#5fa561",
  purple: "#a97bd6",
  red: "#e05252",
  yellow: "#e0b83e",
  pink: "#e07fc9",
  teal: "#4fb8a8",
};

export function resolveColor(c: string | undefined): string | undefined {
  if (!c) return undefined;
  if (c.startsWith("#")) return c;
  return NAMED_COLORS[c.toLowerCase()];
}

export function isConfigPath(arg: string): boolean {
  return existsSync(arg) && /\.(jsonc?|json5?)$/i.test(arg);
}

export function loadConfig(path: string): PlayerConfig {
  let raw = readFileSync(path, "utf8");
  // Strip `// line` and `/* block */` comments so JSONC is accepted.
  raw = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse config ${path}: ${(e as Error).message}`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { sessionId?: unknown }).sessionId !== "string"
  ) {
    throw new Error(`Config ${path} must include a string "sessionId"`);
  }
  return parsed as PlayerConfig;
}
