# Save Pipeline — VS Code 扩展设计文档

| 项目 | 内容 |
| :-- | :-- |
| **仓库名** | `vscode-save-pipeline` |
| **简介** | Run configurable sequences of VS Code commands and shell commands on file save |

> 保存文件时按配置顺序执行 VS Code 命令与 Shell 命令管线。用户只需写 settings.json，即可编排多步格式化、检查、代码生成等流程。

---

## 1. 概述

### 1.1 动机

VS Code 原生保存机制只支持单一格式化（`editor.formatOnSave`）或 code actions（`editor.codeActionsOnSave`），无法编排多个扩展命令的执行顺序。当多个扩展都想"保存时做点什么"时，行为不可控——这正是本扩展要解决的问题。

### 1.2 与现有方案的对比

| 方案 | 能拦截保存 | 能跑 VS Code 命令 | 能跑 Shell 命令 | 能配置执行顺序 |
| :-- | :---: | :-----------: | :---------: | :-----: |
| `settings.json` / `formatOnSave` | √ | 仅 formatter | × | × |
| `settings.json` / `codeActionsOnSave` | √ | 仅 code actions | × | × |
| `keybindings.json` + `runCommands` | 仅 Ctrl+S | √ | × | √ |
| `emeraldwalk.RunOnSave` | √ | × | √ | √ |
| `ryuta46.multi-command` | × | √ | × | √ |
| **Save Pipeline** | √ | √ | √ | √ |

### 1.3 核心价值

一条配置解决所有场景：用户只写声明式配置，不写代码，不绑快捷键，不装额外扩展。

---

## 2. 配置设计

### 2.1 Schema

```jsonc
// settings.json
"savePipeline.sequences": [
  {
    "event": "onSave",                   // 触发事件，v0.1 仅支持 "onSave"
    "languages": ["markdown"],          // 目标语言 ID，不填 = 所有文件
    "label": "Table → Format",           // 可选，日志与调试用
    "steps": [
      { "command": "md-table-buddy.formatAllTables" },
      { "command": "editor.action.formatDocument" },
      { "shell": "npx prettier --check ${file}" }
    ]
  },
  {
    "event": "onSave",
    "languages": ["python"],
    "label": "Organize → Format → Lint",
    "steps": [
      { "command": "python.sortImports" },
      { "command": "editor.action.formatDocument" },
      { "shell": "ruff check ${file}" }
    ]
  }
]
```

**序列字段：**

| 字段 | 类型 | 必填 | 说明 |
| :-- | :-- | :-: | :-- |
| `event` | `string` | × | 触发事件类型。v0.1 仅实现 `"onSave"`（也是默认值）；后续版本扩展 `"onOpen"`、`"onChange"` 等 |
| `languages` | `string[]` | × | 匹配 `document.languageId`；不填则对所有文件生效 |
| `label` | `string` | × | 仅在输出面板 / 调试日志中显示，不做逻辑判断 |
| `steps` | `Step[]` | √ | 有序步骤数组，每步可以是 VS Code 命令或 Shell 命令 |
| `exclude` | `string[]` | × | glob 模式数组，匹配成功的文件跳过此序列。匹配文件绝对路径和相对路径 |

**步骤类型 `Step`：**

| 字段 | 类型 | 必填 | 说明 |
| :-- | :-- | :-: | :-- |
| `command` | `string` | 二选一 | VS Code 命令 ID |
| `shell` | `string` | 二选一 | Shell 命令字符串，支持占位符（见 2.4） |
| `cwd` | `string` | × | Shell 步骤的工作目录，默认 `${workspaceFolder}` |
| `timeout` | `number` | × | Shell 步骤超时（毫秒），默认 30000（30 秒） |
| `env` | `object` | × | Shell 步骤的额外环境变量（合并到 `process.env`） |

> `command` 与 `shell` 必须且只能指定其一。

### 2.2 `when` 条件的取舍

VS Code 的 `when` 子句只能在 UI 层（快捷键、菜单）中求值，扩展 JS API **没有**直接暴露 `when` 求值器。强行实现需要：

- 维护 `ContextKeyService` 的内部状态快照
- 解析 `when` 表达式语法树
- 处理大量边界情况（activeEditor、resourceScheme、config.* 等）

**当前版本的决策**：用 `languages` 替代 `when`。它覆盖了 90% 的文件类型过滤需求，实现简单可靠。架构上预留 `when` 字段，解析器作为未来的独立模块接入。

### 2.3 配置示例

**保存 Markdown 时先 format 表格，再全文档 format，最后 Shell 检查：**

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["markdown"],
    "steps": [
      { "command": "md-table-buddy.formatAllTables" },
      { "command": "editor.action.formatDocument" },
      { "shell": "echo '${fileBasename}' saved." }
    ]
  }
]
```

**保存 Python 时三步修复：**

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["python"],
    "steps": [
      { "command": "editor.action.organizeImports" },
      { "command": "editor.action.formatDocument" },
      { "shell": "ruff check --fix ${file}" }
    ]
  }
]
```

**多个序列匹配同一文件**：按配置顺序依次执行（不做合并或去重）。

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["javascript", "typescript"],
    "label": "ESLint fix + Prettier",
    "steps": [
      { "command": "eslint.executeAutofix" },
      { "command": "editor.action.formatDocument" }
    ]
  },
  {
    "languages": ["typescript"],
    "label": "TS 额外：organize imports",
    "steps": [
      { "command": "editor.action.organizeImports" },
      { "shell": "tsc --noEmit ${file}" }
    ]
  }
]
// 对 TypeScript 文件：先执行序列 1，再执行序列 2
```

**排除大文件和特定目录：**

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["markdown"],
    "exclude": ["**/archive/**", "**/node_modules/**", "**/CHANGELOG.md"],
    "steps": [
      { "command": "md-table-buddy.formatAllTables" },
      { "command": "editor.action.formatDocument" }
    ]
  }
]
```

> `exclude` 使用简易 glob 匹配（零依赖，见 6 节 `globToRegex` 实现）。

### 2.4 占位符（Shell 步骤）

Shell 命令字符串中可使用以下占位符，执行时自动替换为实际值：

| 占位符 | 替换为 | 示例（文件 `docs/guide.md`） |
| :-- | :-- | :--------------------- |
| `${file}` | 文件绝对路径 | `C:\project\docs\guide.md` |
| `${fileBasename}` | 文件名（含扩展名） | `guide.md` |
| `${fileBasenameNoExt}` | 文件名（不含扩展名） | `guide` |
| `${fileExtname}` | 扩展名（含点） | `.md` |
| `${fileDirname}` | 文件所在目录绝对路径 | `C:\project\docs` |
| `${relativeFile}` | 相对于工作区根目录的路径 | `docs\guide.md` |
| `${workspaceFolder}` | 工作区根目录 | `C:\project` |
| `${cwd}` | VS Code 进程的工作目录 | `C:\Users\Administrator` |
| `${env.VAR}` | 进程环境变量 | `${env.HOME}` → `/home/user` |

> 占位符对 VS Code 命令步骤（`command` 字段）无效，因为 `executeCommand` 不支持动态替换。未来通过 `args` 字段实现参数传递。

---

## 3. 架构设计

### 3.1 技术栈

| 层 | 选型 | 理由 |
| :-- | :-- | :-- |
| 运行时 | 纯 JavaScript（CommonJS） | 零编译，直接运行在 VS Code 的 Node.js 环境 |
| 打包 | `@vscode/vsce` | VS Code 官方打包工具 |
| Shell 执行 | Node.js 内置 `child_process.exec` | 无需第三方依赖 |
| 依赖 | 无第三方库 | 全部使用 Node.js 标准库与 VS Code API |

### 3.2 文件结构

```
save-pipeline/
├── .vscodeignore        # 打包时排除的文件
├── CHANGELOG.md
├── LICENSE
├── README.md
├── package.json         # 扩展清单
└── extension.js         # 唯一源文件
```

### 3.3 核心机制选择

VS Code 提供两个保存钩子：

| 钩子 | 时机 | 能修改文档 | 适用本场景 |
| :-- | :-- | :---- | :---- |
| `onWillSaveTextDocument` | 保存前 | √（通过 TextEdit） | √ |
| `onDidSaveTextDocument` | 保存后 | × | × |

选择 `onWillSaveTextDocument`：当用户配置的命令包含格式化类操作时，需要在保存前修改文档内容。此钩子接收的 `TextDocumentWillSaveEvent` 允许通过 `event.waitUntil()` 返回编辑操作，VS Code 会等待编辑完成后再写入磁盘。

**命令对文档的副作用处理**：调用 `vscode.commands.executeCommand('editor.action.formatDocument')` 时，格式化器会直接通过编辑器 API 修改缓冲区。`onWillSaveTextDocument` 只保证钩子执行完才写入，但不会"等待"异步命令的文档修改完成。因此所有 `executeCommand` 必须 `await`，确保顺序执行。

### 3.4 `activationEvents`

```json
"activationEvents": [
  "onStartupFinished"
]
```

`onLanguage:*` 的问题：

- 需要枚举所有可能的语言（`onLanguage:markdown`、`onLanguage:python`...），用户配置新语言时扩展不会激活。
- 扩展本身极小，`onStartupFinished` 延迟到窗口就绪后激活，不影响启动速度。

### 3.5 执行流程

```
文件保存触发
  │
  ▼
onWillSaveTextDocument(event)
  │
  ▼
读取 savePipeline.sequences
  │
  ▼
遍历每个序列
  │
  ├── 有 languages？ → 不匹配则跳过
  │
  ├── 第一个匹配序列
  │     ├── step[0]: 是 command？
  │     │     └── executeCommand(id) → await
  │     ├── step[0]: 是 shell？
  │     │     ├── 替换占位符（${file}, ${workspaceFolder} ...）
  │     │     └── child_process.exec(cmd, { cwd, env, timeout }) → await
  │     ├── step[1]: ...
  │     └── ...
  │
  ├── 第二个匹配序列（如有）
  │     └── ...
  │
  ▼
VS Code 缓冲区被 pipeline 修改完毕
  │
  ▼
VS Code 写入磁盘
```

### 3.6 错误处理

| 场景 | 行为 |
| :-- | :-- |
| 步骤既无 `command` 也无 `shell` | 跳过，输出 Warning |
| `command` 步骤：命令不存在 | 输出 Warning，跳过该步骤（不停止序列） |
| `command` 步骤：执行抛异常 | 输出 Error，**停止当前序列**后续步骤，不阻止保存 |
| `shell` 步骤：进程返回非零 exit code | 输出 stderr 到 Output 面板，**停止当前序列**后续步骤，不阻止保存 |
| `shell` 步骤：进程超时 | 强制终止进程，输出 timeout Error，停止当前序列 |
| 某条序列失败 | 不影响前序序列已完成的修改，不影响文件保存 |

Shell 步骤的 stdout 和 stderr 均写入 Output 面板。如果进程成功（exit code = 0），不弹出面板；失败时自动显示面板。

---

## 4. 步骤执行机制

### 4.1 VS Code 命令步骤（`command`）

- **异步**：`executeCommand()` 返回 `Thenable<T | undefined>`，必须 `await` 才能保证顺序
- **无超时**：命令自身决定何时 resolve。慢速命令（如 linter fix）可能阻塞保存
- **无参数**：当前版本不对命令传参，仅执行命令 ID。未来通过 `args` 字段扩展

命令存在性检查——扩展加载时和配置变更时执行一次全量检查：

```js
const allCommands = await vscode.commands.getCommands(true);
// 输出所有不存在的命令 ID 到 Output 面板，但不阻止激活
```

保存时不重复检查，直接执行——不存在的命令 `executeCommand` 会 reject，由错误处理逻辑捕获。

### 4.2 Shell 命令步骤（`shell`）

使用 Node.js 内置 `child_process.exec` 执行，核心参数：

| 参数 | 来源 | 默认值 |
| :-- | :-- | :-- |
| `command` | 用户配置的 `shell` 字符串，替换占位符后 | — |
| `cwd` | 步骤的 `cwd` 字段，支持 `${workspaceFolder}` 等占位符 | `${workspaceFolder}` |
| `timeout` | 步骤的 `timeout` 字段（毫秒） | 30000 |
| `env` | 合并 `process.env` + 步骤的 `env` 字段 | 当前进程环境变量 |
| `maxBuffer` | 硬编码 | 1024 × 1024（1MB） |
| `shell` | 硬编码为 `true`，使用系统默认 shell | Windows: `cmd.exe`<br>Linux/macOS: `/bin/sh` |

**设计决策：`exec` vs `spawn`**

|  | `exec` | `spawn` |
| :-- | :----- | :------ |
| 输出缓冲 | 一次性返回全部 stdout/stderr | 流式 |
| 代码复杂度 | 低 | 高 |
| 适用场景 | 短命令（格式化、lint） | 长运行进程 |

选择 `exec`：用户配置的 Shell 步骤通常是 `npx prettier`、`ruff check` 等短命令，输出量小。1MB buffer 上限足够。未来可扩展为 `spawn` 模式（通过 `{ "shell": "...", "mode": "spawn" }`）。

### 4.3 依赖声明

对于强依赖的扩展（如 `md-table-buddy.formatAllTables` 依赖 `thgossler.md-table-buddy`），`package.json` 不强制声明 `extensionDependencies`，原因：

- 用户的命令可能来自内置命令（如 `editor.action.formatDocument`）
- 用户的命令可能来自某个可选扩展
- 强制依赖会阻止 VS Code 在没有这些扩展的机器上安装本扩展

改为在 README 中注明推荐搭配的扩展。

---

## 5. `package.json` 清单

```json
{
  "name": "save-pipeline",
  "displayName": "Save Pipeline",
  "description": "Run configurable sequences of VS Code commands on file save",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "license": "MIT",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./extension.js",
  "contributes": {
    "configuration": {
      "type": "object",
      "title": "Save Pipeline",
      "properties": {
        "savePipeline.sequences": {
          "type": "array",
          "default": [],
          "description": "Command sequences to execute on file save",
          "items": {
            "type": "object",
            "properties": {
              "event": {
                "type": "string",
                "default": "onSave",
                "enum": ["onSave"],
                "description": "Trigger event. v0.1: only \"onSave\" is supported."
              },
              "languages": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Target language IDs. Leave empty for all files."
              },
              "label": {
                "type": "string",
                "description": "Optional label for debugging."
              },
              "exclude": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Glob patterns to exclude files from this sequence."
              },
              "steps": {
                "type": "array",
                "description": "Ordered steps to execute. Each step is either a VS Code command or a shell command.",
                "items": {
                  "type": "object",
                  "properties": {
                    "command": {
                      "type": "string",
                      "description": "VS Code command ID to execute."
                    },
                    "shell": {
                      "type": "string",
                      "description": "Shell command to run. Supports placeholders like ${file}, ${workspaceFolder}."
                    },
                    "cwd": {
                      "type": "string",
                      "description": "Working directory for shell step. Defaults to ${workspaceFolder}."
                    },
                    "timeout": {
                      "type": "number",
                      "description": "Timeout in ms for shell step. Default 30000."
                    },
                    "env": {
                      "type": "object",
                      "description": "Extra environment variables for shell step."
                    }
                  }
                }
              }
            },
            "required": ["steps"]
          }
        }
      }
    }
  }
}
```

---

## 6. `extension.js` 伪代码

```js
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

function activate(context) {
  const output = vscode.window.createOutputChannel('Save Pipeline', { log: true });

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(async (e) => {
      const sequences = vscode.workspace
        .getConfiguration('savePipeline')
        .get('sequences', []);
      const lang = e.document.languageId;

      for (const seq of sequences) {
        // v0.1：仅处理 "onSave"（默认值）
        const event = seq.event ?? 'onSave';
        if (event !== 'onSave') continue;

        if (seq.languages?.length && !seq.languages.includes(lang)) continue;

        // 文件排除检查
        if (seq.exclude?.length && shouldExclude(e.document, seq.exclude)) {
          output.info(`[${seq.label ?? 'unnamed'}] 跳过（exclude 匹配）`);
          continue;
        }

        for (const step of seq.steps ?? []) {
          try {
            if (step.command) {
              // VS Code 命令步骤
              output.info(`[${seq.label ?? 'unnamed'}] command: ${step.command}`);
              await vscode.commands.executeCommand(step.command);
            } else if (step.shell) {
              // Shell 命令步骤
              const cmd = resolvePlaceholders(step.shell, e.document);
              await execShell(cmd, step, e.document);
            } else {
              output.warn(`[${seq.label ?? 'unnamed'}] 步骤缺少 command 或 shell，跳过`);
            }
          } catch (err) {
            output.error(
              `[${seq.label ?? 'unnamed'}] ${step.command ?? step.shell} → ${err.message}`
            );
            break; // 停止当前序列后续步骤
          }
        }
      }
    })
  );
}

function resolvePlaceholders(template, document) {
  const filePath = document.uri.fsPath;
  const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const wsPath = wsFolder?.uri.fsPath ?? path.dirname(filePath);
  return template
    .replace(/\$\{file\}/g, filePath)
    .replace(/\$\{fileBasename\}/g, path.basename(filePath))
    .replace(/\$\{fileBasenameNoExt\}/g, path.basename(filePath, path.extname(filePath)))
    .replace(/\$\{fileExtname\}/g, path.extname(filePath))
    .replace(/\$\{fileDirname\}/g, path.dirname(filePath))
    .replace(/\$\{relativeFile\}/g, path.relative(wsPath, filePath))
    .replace(/\$\{workspaceFolder\}/g, wsPath)
    .replace(/\$\{cwd\}/g, process.cwd())
    .replace(/\$\{env\.(\w+)\}/g, (_, name) => process.env[name] ?? '');
}

function execShell(command, step, document) {
  const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const defaultCwd = wsFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath);
  const cwd = step.cwd ? resolvePlaceholders(step.cwd, document) : defaultCwd;
  const timeout = step.timeout ?? 30000;
  const env = { ...process.env, ...(step.env ?? {}) };

  return new Promise((resolve, reject) => {
    const child = exec(command, { cwd, env, timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (stdout) output.info(`[shell stdout]\n${stdout}`);
      if (stderr && !error) output.warn(`[shell stderr]\n${stderr}`);
      if (error) {
        if (stderr) output.error(`[shell stderr]\n${stderr}`);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

// glob 匹配（零依赖实现：转 glob 为正则）
function shouldExclude(document, patterns) {
  const filePath = document.uri.fsPath;
  const relativePath = vscode.workspace.asRelativePath(document.uri);
  return patterns.some(pattern => {
    // 分别匹配绝对路径和相对路径
    const regex = globToRegex(pattern);
    return regex.test(filePath) || regex.test(relativePath);
  });
}

function globToRegex(pattern) {
  // 将简单的 glob 模式转为正则：** → .* 、* → [^/]* 、? → .
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$');
}

module.exports = { activate };
```

---

## 7. 使用场景

### 场景 1：Markdown — 多格式化器协作

markdown-all-in-one 负责列表、标题；table-buddy 负责表格。两个扩展各自 `formatOnSave` 执行顺序不定且互相干扰。

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["markdown"],
    "label": "Tables then document",
    "steps": [
      { "command": "md-table-buddy.formatAllTables" },
      { "command": "editor.action.formatDocument" }
    ]
  }
]
```

对应的 `[markdown]` 中需关闭 `editor.formatOnSave`（否则会和本扩展的管线重复执行）。

### 场景 2：Python — 三步修复

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["python"],
    "steps": [
      { "command": "python.sortImports" },
      { "command": "ruff.executeAutofix" },
      { "command": "editor.action.formatDocument" }
    ]
  }
]
```

### 场景 3：多语言项目共存

一个项目含 `src/`（Python）和 `docs/`（Markdown），各自配置不同管线，互不干扰。

### 场景 4：前端项目 — VS Code 命令 + Shell 混合

保存 TypeScript 文件时：先 ESLint 修复，再 Prettier 格式化，最后跑 TypeScript 编译检查。

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["typescript"],
    "label": "Lint → Format → TypeCheck",
    "steps": [
      { "command": "eslint.executeAutofix" },
      { "command": "editor.action.formatDocument" },
      { "shell": "npx tsc --noEmit --project tsconfig.json", "timeout": 60000 }
    ]
  }
]
```

### 场景 5：笔记仓库 — 保存后自动 Git 操作

```jsonc
"savePipeline.sequences": [
  {
    "languages": ["markdown"],
    "steps": [
      { "command": "md-table-buddy.formatAllTables" },
      { "shell": "git add ${file} && git commit -m 'auto: save ${relativeFile}'", "cwd": "${workspaceFolder}" }
    ]
  }
]
```

---

## 8. 已知问题与限制

### 8.1 与原生 formatOnSave / codeActionsOnSave 的关系

本扩展**不接管也不屏蔽**原生格式化。用户须自行判断：如果同时开启 `editor.formatOnSave` 和本扩展，可能导致同一文件被格式化两次。

**推荐做法**：用本扩展完全替代原生方案，在序列中显式加入 `{ "command": "editor.action.formatDocument" }`。

### 8.2 无 `when` 表达式支持

当前仅支持 `languages` 过滤。无法做 `editorLangId == python && resourceDirname =~ /src/` 这样的复合条件。`when` 解析器计划于 v0.2 实现。

### 8.3 大文件性能

每条命令对编辑器状态施加修改（如格式化整个文档），大文件可能产生显著延迟。本扩展不缓存也不节流，速度取决于被调命令本身。

### 8.4 命令间无数据传递

`steps` 之间不共享状态，前一个步骤的修改通过编辑器缓冲区或文件系统间接影响后续步骤，不通过 JavaScript 变量传递。

### 8.5 Shell 步骤的安全性

Shell 命令以当前 VS Code 进程权限运行，没有任何沙箱隔离。恶意工作区可通过 `.vscode/settings.json` 注入危险命令。**这是故意为之**——不设置安全限制，把责任交给用户判断（与 VS Code tasks.json 的安全模型一致）。

---

## 9. 未来扩展

### v0.2

- **事件扩展**：`event` 增加 `"onOpen"`（`onDidOpenTextDocument`）、`"onChange"`（`onDidChangeTextDocument`）。每个 sequence 独立指定事件，同一个 settings.json 可混合多种事件配置
- `when` 子句支持：实现轻量的条件解析器

### v0.3+

- 条件分支：`if`/`else` 在步骤间做选择
- VS Code 命令参数：`{ "command": "...", "args": [...] }`
- Shell 步骤结果捕获：后续步骤可通过占位符引用前一步的输出（`${prev.stdout}`）
- 配置向导（Walkthrough）：帮助新用户生成首条配置
- 性能仪表板：Output 面板显示每条步骤耗时

---

## 10. 参考

- [VS Code Extension API — onWillSaveTextDocument](https://code.visualstudio.com/api/references/vscode-api#workspace.onWillSaveTextDocument)
- [VS Code — when clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)
- [emeraldwalk.RunOnSave](https://marketplace.visualstudio.com/items?itemName=emeraldwalk.RunOnSave)
- [ryuta46.multi-command](https://marketplace.visualstudio.com/items?itemName=ryuta46.multi-command)
