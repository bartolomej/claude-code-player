import chalk from "chalk";

// Terracotta from claude-code-archive theme.ts (clawd_body). We intentionally do
// not use black cell backgrounds: Ink layers bg+fg for the in-app TUI, but
// chalk bgRgb(0,0,0) paints whole cells black and looks like solid bars next to
// the reference raster logo (terracotta + eyes only, no black fill bands).
const CLAWD_BODY = chalk.rgb(215, 119, 87);

const DEFAULT_SEGMENTS = {
  r1L: " ▐",
  r1E: "▛███▜",
  r1R: "▌",
  r2L: "▝▜",
  r2M: "█████",
  r2R: "▛▘",
} as const;

/**
 * Renders the default-pose Clawd (3 lines), same glyphs as LogoV2/Clawd.tsx.
 */
export function renderClawdRows(): [string, string, string] {
  const s = DEFAULT_SEGMENTS;
  const line1 = CLAWD_BODY(s.r1L + s.r1E + s.r1R);
  const line2 = CLAWD_BODY(s.r2L + s.r2M + s.r2R);
  const line3 = CLAWD_BODY("  ▘▘ ▝▝  ");
  return [line1, line2, line3];
}
