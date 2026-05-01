---
name: make-config
description: Generate a ccplay config file that filters noisy parts of a Claude Code session for a clean demo replay. Give it a session ID and optional guidance.
model: opus
---

Generate a `ccplay` config file that filters out noisy parts of a Claude Code session for a clean demo replay.

## Usage

The user gives you a session ID (UUID) and optionally guidance about what to keep or remove, the desired user name, agent name/color, or output file path. Example prompts:

- `017c7023-92ba-45c0-807f-bac2c64480e5`
- `017c7023-92ba-45c0-807f-bac2c64480e5 — skip all the credential setup, keep the eval results`
- `abc123... user=Bart agent=my-bot color=purple`

## Steps

### 1. Locate and parse the session

Find the session JSONL under `~/.claude/projects/**/<session-id>.jsonl`. Parse every line as JSON. If the file isn't found, tell the user and stop.

### 2. Extract metadata

From the parsed entries, pull out:

- **cwd** — the working directory (from meta entries with `cwd`)
- **model** — from `message.model` on assistant entries
- **agentSetting** — the agent name if present
- **organizationName** — if present

These help you suggest good defaults for the config's `agent.name` and `user` fields.

### 3. Catalog every event

Build a summary of each event in the session. For every entry:

- **User text messages**: show the first ~120 chars. Note the entry index.
- **Assistant text blocks**: show the first ~120 chars. Note the entry index.
- **Tool uses**: note the tool name, and a short preview of the input (command for Bash, file_path for Read/Edit/Write, etc.)
- **Tool results**: note which tool_use_id they correspond to.

Print this catalog so you can reason about it. Use a compact format like:
```
4 USER: I have a folder of Federal Reserve...
6 ASST: Beige Books are a great fit...
7 TOOL: AskUserQuestion
14 TOOL: Bash(ls ./beige-books | head -20)
```

### 4. Identify noise patterns

Look for these categories of noise and note which entries they affect:

**User noise** — messages that are just plumbing, not substantive prompts:
- Short affirmations: "continue", "go ahead", "keep going", "try again", "skip", "yes", "ok"
- Setup confirmations: "the .env file is there", "it's set up", "credentials are ready"
- Task notifications: `<task-notification>` XML blocks
- Slash command artifacts: `<local-command-...>` or `<command-...>` tags
- Redundant re-prompts: "training finished, continue" when the assistant already knows

**Assistant noise** — messages that don't advance the narrative:
- Credential/env setup instructions: asking user to create .env files, checking env vars
- Polling/waiting status: "Pipeline is still running", "I'll wait for it", "Poller is running"
- Task notification acknowledgements: "Acknowledged — that was just my watcher..."
- Redundant recaps: restating what was already shown
- Error recovery chatter: "The Jupyter kernel picked the wrong Python", "The eval script died early"
- "No response requested" or "API Error:" messages

**Tool noise** — entire tool categories that add no demo value:
- Usually none should be excluded entirely, but consider `AskUserQuestion` if the answers are already reflected in the assistant messages that follow. If answers provide important context visible nowhere else, keep it.

### 5. Draft filter regexes

For each noisy message, write a regex that matches its start. Use `^` anchors. Be specific enough to avoid false positives — match the distinctive opening words, not just a single common word. Group similar patterns.

Test your regexes mentally against the catalog: would any of them accidentally match a message you want to keep?

### 6. Decide on AskUserQuestion

Check each `AskUserQuestion` tool call:
- Read the input (the questions and options)
- Read the corresponding tool_result to see what the user answered
- If the Q&A provides context that appears nowhere else in the session, keep it
- If the assistant's next message already summarizes the user's choice, it's safe to exclude

If excluding, add `"AskUserQuestion"` to `excludeTools`.

### 7. Count filtered vs. unfiltered events

Before writing the config, mentally run the filters against the catalog and report:
- Total raw JSONL entries
- Events after normalization (without filters)
- Events after your proposed filters
- Breakdown: user messages, assistant messages, tool calls, notifications

This helps the user judge whether too much or too little was cut.

### 8. Write the config file

Write a JSON config to `configs/<descriptive-name>.json`. Use the project directory name or a slug derived from the session's purpose as the filename. Structure:

```jsonc
{
  "sessionId": "<uuid>",
  "user": "<name — use the user's name from meta or ask>",
  "agent": {
    "name": "<from agentSetting or ask>",
    "color": "<pick a color that fits the agent's domain>"
  },
  "speed": {
    "wpm": 6000,
    "turnDelayMs": 500,
    "toolDelayMs": 250,
    "thinkMs": 900
  },
  "tools": {
    "dim": true,
    "runThreshold": 3,
    "runToolDelayMs": 80,
    "runSkipSpinner": true
  },
  "filters": {
    "excludeUser": [ /* regexes */ ],
    "excludeAssistant": [ /* regexes */ ],
    "excludeTools": [ /* tool names */ ]
  }
}
```

### 9. Validate

Run the config through the project's normalizer to verify:
1. The JSON parses without errors
2. The filter count matches your estimate
3. The remaining event flow tells a coherent story

Use this validation script:
```bash
node -e "
const fs = require('fs');
const { normalize } = require('./dist/events.js');
const { loadConfig } = require('./dist/config.js');
const config = loadConfig('<config-path>');
const sessionPath = require('os').homedir() + '/.claude/projects/' + fs.readdirSync(require('os').homedir() + '/.claude/projects/').find(d => fs.existsSync(require('os').homedir() + '/.claude/projects/' + d + '/' + config.sessionId + '.jsonl')) + '/' + config.sessionId + '.jsonl';
const lines = fs.readFileSync(sessionPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const { events } = normalize(lines, config.filters);
let counts = { user: 0, assistant: 0, tool: 0, notification: 0 };
for (const e of events) counts[e.kind]++;
console.log('Events:', counts, 'Total:', events.length);
for (const e of events) {
  if (e.kind === 'user') console.log('USER:', e.text.substring(0, 100));
  else if (e.kind === 'assistant') console.log('ASST:', e.text.substring(0, 100));
  else if (e.kind === 'tool') console.log('TOOL:', e.name);
  else console.log('NOTIF:', e.summary?.substring(0, 80));
}
"
```

If the flow has gaps (e.g., an assistant message references something that was filtered), adjust the regexes.

### 10. Report to the user

Print:
- The config file path
- The before/after event counts
- A brief narrative of the demo flow (the story the replay will tell)
- Any judgment calls you made (e.g., "I excluded AskUserQuestion because the assistant always restated the user's choice")

## Important guidelines

- **Be conservative with filters.** When in doubt, keep a message. A slightly long demo is better than one with confusing gaps.
- **Never filter the first user message.** It sets up the entire session.
- **Never filter result messages** (assistant messages with tables, metrics, or final outcomes). These are the payoff.
- **Regex specificity matters.** `"^Pipeline"` is too broad — it would catch "Pipeline completed" (a result you want to keep). Use `"^Pipeline is still running"` or `"^Pipeline is running\\. I'll wait"` instead.
- **The config file goes in `configs/`** which is gitignored, so personal session IDs won't leak.
- **JSONC comments are supported** by the config loader, but write pure JSON for maximum compatibility.
- **Build must be current.** If `dist/` doesn't have the latest code, run `npm run build` first before validating.
