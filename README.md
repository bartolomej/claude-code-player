# claude-code-player

Replay a Claude Code session as a demo-friendly TUI.

Reads a session JSONL from `~/.claude/projects/**` by session ID and re-emits
the essential conversation (user messages + assistant text + tool-call
indicators + AskUserQuestion flows) with a typewriter effect — useful for
recording demos of long agent runs without sitting through hours of real-time.

## Usage

```sh
npm install
npm run build

# Play a session directly by ID:
./dist/cli.js <session-id>

# Or load a config file:
./dist/cli.js examples/demo.json
```

During development:

```sh
npm run dev -- <session-id-or-config-path>
```

## Config file

Drive the replay from a JSON file so you don't have to re-type flags each
time. Any field except `sessionId` is optional.

```json
{
  "sessionId": "c5c2ab62-fa0d-4710-8d6d-eaa17cd22f8b",
  "user": "Pete",
  "agent": {
    "name": "lightningrod-assistant",
    "color": "orange"
  },
  "speed": {
    "wpm": 3500,
    "turnDelayMs": 800,
    "toolDelayMs": 400,
    "thinkMs": 1400
  },
  "filters": {
    "excludeUser": ["^skip$", "^continue$", "try again"],
    "excludeAssistant": ["^I apologize"],
    "excludeTools": ["Bash"]
  }
}
```

- `agent.color` accepts hex (`#d97757`) or a named color: `orange`, `blue`,
  `green`, `purple`, `red`, `yellow`, `pink`, `teal`.
- `filters.excludeUser` / `excludeAssistant` are case-insensitive regexes
  tested against message text. Useful for stripping plumbing turns like
  `"skip"`, `"continue"`, `"try again with …"` so the demo stays focused.
- `filters.excludeTools` drops tool calls by name (e.g. hide every `Bash`
  call).

Inline `//` and `/* … */` comments are allowed in the JSON file.

## CLI flags

CLI flags override config values, which override defaults.

| Flag | Purpose | Default |
| --- | --- | --- |
| `--wpm <n>` | Typing speed (words/min) | 3500 |
| `--turn-delay <ms>` | Pause between turns | 800 |
| `--tool-delay <ms>` | Pause after a tool indicator | 400 |
| `--think-ms <ms>` | Thinking-spinner duration (0 disables) | 1400 |
| `--agent <name>` | Agent label (bottom pill) | from session |
| `--agent-color <c>` | Agent pill color | brand orange |
| `--user <name>` | Greeting name | `$USER` |
