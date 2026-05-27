# Changelog

## [0.1.0] - 2026-05-27

### Added

- Initial release
- `savePipeline.sequences` setting with JSON schema + `oneOf` validation
- VS Code command steps (`command` field) via `executeCommand`
- Shell command steps (`shell` field) via `child_process.exec`
- Language filtering (`languages` field)
- File exclusion via glob patterns (`exclude` field)
- Placeholder expansion in shell commands (`${file}`, `${workspaceFolder}`, `${env.VAR}`, etc.)
- `e.waitUntil()` — VS Code waits for all steps before writing to disk
- Output Channel logging with auto-reveal on error
- Command validation on startup and config change
- Untrusted workspace support (`"limited"`)
- Zero external dependencies — pure Node.js + VS Code API
