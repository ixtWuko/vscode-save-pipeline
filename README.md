# Save Pipeline

Run configurable sequences of VS Code commands and shell commands on file save.

Define ordered pipelines in `settings.json` — no keybindings, no code, no extra extensions needed.

## Features

- Execute any VS Code command ID and shell command in sequence on save
- Filter by `languageId` and glob `exclude` patterns
- Built-in placeholders: `${file}`, `${workspaceFolder}`, `${relativeFile}`, `${env.VAR}` and more
- `waitUntil` — VS Code waits for all steps to complete before writing to disk
- Zero dependencies (pure Node.js + VS Code API)
- Output Channel logging with auto-reveal on errors
- Command validation on startup and config change

## Requirements

- VS Code `^1.80.0`

## Configuration

Edit your `settings.json`:

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["markdown"],
    "label": "Tables → Format → Check",
    "steps": [
      { "command": "md-table-buddy.formatAllTables" },
      { "command": "editor.action.formatDocument" },
      { "shell": "npx prettier --check ${file}" }
    ]
  },
  {
    "languages": ["python"],
    "exclude": ["**/archive/**"],
    "label": "Organize → Format → Lint",
    "steps": [
      { "command": "python.sortImports" },
      { "command": "editor.action.formatDocument" },
      { "shell": "ruff check ${file}" }
    ]
  },
  {
    "label": "Log every save",
    "steps": [
      { "shell": "echo [save] ${relativeFile}" }
    ]
  }
]
```

### Step fields

| Field | Type | Required | Description |
| :---- | :--- | :------: | :---------- |
| `command` | `string` | ① | VS Code command ID |
| `shell` | `string` | ① | Shell command (placeholders supported) |
| `cwd` | `string` | × | Working directory (default: `${workspaceFolder}`) |
| `timeout` | `number` | × | Shell timeout in ms (default: 30000) |
| `env` | `object` | × | Extra env vars for shell step |

① `command` / `shell` must specify exactly one per step.

### Sequence fields

| Field | Type | Required | Description |
| :---- | :--- | :------: | :---------- |
| `event` | `string` | × | Trigger event. v0.1: only `"onSave"` (default) |
| `languages` | `string[]` | × | Filter by `document.languageId`. Empty = all files |
| `label` | `string` | × | Shown in Output Channel logs |
| `exclude` | `string[]` | × | Glob patterns to exclude files |
| `steps` | `Step[]` | √ | Ordered steps to execute |

### Placeholders (shell steps)

| Placeholder | Example | Replaced with |
| :---------- | :------ | :------------ |
| `${file}` | `C:\project\docs\guide.md` | Absolute file path |
| `${fileBasename}` | `guide.md` | File name + extension |
| `${fileBasenameNoExt}` | `guide` | File name, no extension |
| `${fileExtname}` | `.md` | File extension |
| `${fileDirname}` | `C:\project\docs` | File directory |
| `${relativeFile}` | `docs\guide.md` | Path relative to workspace |
| `${workspaceFolder}` | `C:\project` | Workspace root |
| `${cwd}` | — | VS Code process cwd |
| `${env.VAR}` | — | Environment variable |

## Notes

- This extension **does not** disable `editor.formatOnSave`. If both are enabled, formatting may run twice. Recommended: disable native format-on-save and add `editor.action.formatDocument` explicitly in your pipeline.
- Shell commands run with the same privileges as the VS Code process. The security model matches VS Code's built-in tasks.

## Known Issues

- No `when` clause support yet (v0.2 planned)
- Command steps do not support arguments (`args` field planned in v0.3+)
- No data passing between steps

## Release

See [CHANGELOG.md](./CHANGELOG.md) for version history.
