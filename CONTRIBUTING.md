# Save Pipeline — 操作指南 &middot; 从零创建到发布

本指南将带你一步一步创建一个 VSCode 扩展（Save Pipeline），包含依赖说明和 CI/CD 配置。全流程无需编译步骤，纯 JavaScript + Node.js 标准库即可运行。

---

## 目录

1. [环境要求](#1-环境要求)
2. [创建项目结构](#2-创建项目结构)
3. [编写 package.json](#3-编写-packagejson)
4. [编写 extension.js](#4-编写-extensionjs)
5. [配置打包排除](#5-配置打包排除)
6. [本地测试与调试](#6-本地测试与调试)
7. [发布到 VS Code Marketplace](#7-发布到-vs-code-marketplace)
8. [配置 CI/CD (GitHub Actions)](#8-配置-cicd-github-actions)
9. [版本管理与 CHANGELOG](#9-版本管理与-changelog)
10. [常见问题](#10-常见问题)

---

## 1. 环境要求

| 工具 | 版本 | 用途 |
| :-- | :-- | :-- |
| [Node.js](https://nodejs.org) | ≥ 18.x | 运行 VS Code 扩展的宿主环境 |
| [VS Code](https://code.visualstudio.com) | ≥ 1.80.0 | 开发和调试的目标编辑器 |
| [Git](https://git-scm.com) | ≥ 2.30 | 版本控制 |
| npm | ≥ 9.x | 随 Node.js 附带，用于安装工具链 |
| `@vscode/vsce` | latest | VS Code 扩展打包与发布工具 |
| GitHub 账号 | — | 可选，用于 CI 自动发布 |

### 1.1 检查环境

启动终端（PowerShell 或 cmd），逐条执行验证：

```bash
node --version
```

期望输出：`v18.x.x` 或更高。

```bash
npm --version
```

期望输出：`9.x.x` 或更高。

```bash
git --version
```

期望输出：`git version 2.x.x` 或更高。

---

## 2. 创建项目结构

### 2.1 初始化目录

```bash
mkdir vscode-save-pipeline
cd vscode-save-pipeline
git init
```

### 2.2 创建全部文件

本扩展的完整文件结构：

```
vscode-save-pipeline/
├── .vscodeignore       # 打包时排除的文件
├── .gitignore
├── CHANGELOG.md
├── CONTRIBUTING.md     # 本文件
├── LICENSE
├── README.md
├── extension.js        # 唯一源文件
├── package.json        # 扩展清单
└── .github/
    └── workflows/
        └── publish.yml # GitHub Actions CI/CD 配置
```

依次创建：

```bash
New-Item -ItemType File -Path .vscodeignore
New-Item -ItemType File -Path .gitignore
New-Item -ItemType File -Path CHANGELOG.md
New-Item -ItemType File -Path CONTRIBUTING.md
New-Item -ItemType File -Path LICENSE
New-Item -ItemType File -Path README.md
New-Item -ItemType File -Path extension.js
New-Item -ItemType File -Path package.json
New-Item -ItemType Directory -Path .github\workflows -Force
New-Item -ItemType File -Path .github\workflows\publish.yml
```

### 2.3 初始化 npm 项目

```bash
npm init -y
```

这会生成一个初始的 `package.json`，之后我们会替换其内容。

---

## 3. 编写 package.json

> 这是 VS Code 扩展的清单文件，VS Code 靠它识别你的扩展、加载入口、注册配置项。

用以下内容**完全替换** `package.json`：

```json
{
  "name": "save-pipeline",
  "displayName": "Save Pipeline",
  "description": "Run configurable sequences of VS Code commands and shell commands on file save",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/vscode-save-pipeline.git"
  },
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
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

### 关键字段说明

| 字段 | 说明 |
| :-- | :-- |
| `publisher` | 你的 VS Code Marketplace 发布者 ID。首次发布前在 [Azure DevOps](https://dev.azure.com) 创建组织获得。先用占位符 `your-publisher-id`，发布前替换 |
| `repository` | 指向你的 GitHub 仓库，CI 自动获取代码时需要 |
| `engines.vscode` | 最低 VS Code 版本要求，`^1.80.0` 表示 ≥1.80 且 <2.0 |
| `activationEvents` | `onStartupFinished` 让扩展在窗口就绪后激活，不拖启动速度，也无需枚举语言 |
| `contributes.configuration` | 向 VS Code 注册 `savePipeline.sequences` 配置项，用户在 `settings.json` 中获得自动补全 |

---

## 4. 编写 extension.js

> 这是扩展的**唯一源文件**。全部逻辑包含于此，零外部依赖。

### 4.1 依赖说明

本扩展**不使用任何第三方 npm 包**。所有功能基于以下内置模块：

| 模块 | 来源 | 用途 |
| :-- | :-- | :-- |
| `vscode` | VS Code API（运行时注入） | 事件监听、命令执行、配置读取、Output 面板 |
| `child_process` | Node.js 标准库 | 执行 Shell 命令（`exec`） |
| `path` | Node.js 标准库 | 路径处理（basename、dirname、extname、relative） |

因此本项目的 `package.json` **不需要** `dependencies` 或 `devDependencies` 字段。

### 4.2 代码实现

用以下内容填充 `extension.js`：

```js
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

function activate(context) {
  const output = vscode.window.createOutputChannel('Save Pipeline', { log: true });

  output.info('Save Pipeline activated');

  async function validateCommands(sequences) {
    const allCommands = await vscode.commands.getCommands(true);
    const invalidIds = [];

    for (const seq of sequences) {
      for (const step of seq.steps ?? []) {
        if (step.command && !allCommands.includes(step.command)) {
          invalidIds.push(step.command);
        }
      }
    }

    if (invalidIds.length > 0) {
      output.warn(`The following command IDs are not currently registered: ${[...new Set(invalidIds)].join(', ')}`);
      output.warn('They may become available later when the corresponding extension activates.');
    }
  }

  async function onConfigChange() {
    const config = vscode.workspace.getConfiguration('savePipeline');
    const sequences = config.get('sequences', []);
    await validateCommands(sequences);
  }

  onConfigChange();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('savePipeline.sequences')) {
        onConfigChange();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(async (e) => {
      const sequences = vscode.workspace
        .getConfiguration('savePipeline')
        .get('sequences', []);
      const lang = e.document.languageId;

      for (const seq of sequences) {
        const event = seq.event ?? 'onSave';
        if (event !== 'onSave') continue;

        if (seq.languages?.length && !seq.languages.includes(lang)) continue;

        if (seq.exclude?.length && shouldExclude(e.document, seq.exclude)) {
          output.info(`[${seq.label ?? 'unnamed'}] skipped (exclude matched)`);
          continue;
        }

        output.info(`[${seq.label ?? 'unnamed'}] running ${seq.steps?.length ?? 0} step(s)`);

        for (const step of seq.steps ?? []) {
          try {
            if (step.command) {
              output.info(`[${seq.label ?? 'unnamed'}] command: ${step.command}`);
              await vscode.commands.executeCommand(step.command);
            } else if (step.shell) {
              const cmd = resolvePlaceholders(step.shell, e.document);
              output.info(`[${seq.label ?? 'unnamed'}] shell: ${cmd}`);
              await execShell(cmd, step, e.document, output);
            } else {
              output.warn(`[${seq.label ?? 'unnamed'}] step missing both "command" and "shell", skipped`);
            }
          } catch (err) {
            output.error(`[${seq.label ?? 'unnamed'}] ${step.command ?? step.shell} → ${err.message}`);
            output.show(true);
            break;
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

function execShell(command, step, document, output) {
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

function shouldExclude(document, patterns) {
  const filePath = document.uri.fsPath;
  const relativePath = vscode.workspace.asRelativePath(document.uri);
  return patterns.some(pattern => {
    const regex = globToRegex(pattern);
    return regex.test(filePath) || regex.test(relativePath);
  });
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$');
}

function deactivate() {}

module.exports = { activate, deactivate };
```

---

## 5. 配置打包排除

### 5.1 .vscodeignore

VS Code 打包扩展时（`vsce package`）会读取 `.vscodeignore` 决定哪些文件不进入 `.vsix` 包。写入：

```
.vscode/**
.github/**
.git
.gitignore
node_modules/**
.vscodeignore
CONTRIBUTING.md
```

### 5.2 .gitignore

写入 Git 忽略规则：

```
node_modules/
*.vsix
.vscode-test/
```

---

## 6. 本地测试与调试

### 6.1 安装打包工具

```bash
npm install -g @vscode/vsce
```

> `@vscode/vsce` 是唯一需要的工具依赖，以全局方式安装，不进入 `package.json` 的 `devDependencies`。

### 6.2 方式一：VS Code 调试窗口（推荐开发用）

1. 用 VS Code 打开项目文件夹 `vscode-save-pipeline`
2. 按 `F5`（或 运行 → 启动调试）
3. 此时会弹出一个新的 VS Code 窗口，标题栏显示 `[Extension Development Host]`
4. 在新窗口中打开任意文件夹，按 `Ctrl+,` 搜索 `savePipeline`
5. 在 `settings.json` 中写入测试配置（见 [DESIGN.md](./DESIGN.md) 第 2.3 节示例）
6. 保存文件 → 观察 Output 面板（`ctrl+shift+u` 切换到 Output，下拉选择 "Save Pipeline"）

### 6.3 方式二：打包后安装

```bash
vsce package
```

该命令生成 `save-pipeline-0.1.0.vsix`。然后在 VS Code 中：
- `Ctrl+Shift+P` → `Extensions: Install from VSIX...` → 选择生成的 `.vsix` 文件
- 安装后按上文配置 `settings.json` 即可

### 6.4 验证多平台兼容性

本扩展仅使用 VS Code API 和 Node.js 标准库，天然跨平台。但建议在 Windows、macOS、Linux 上分别验证 Shell 步骤的行为（路径分隔符、shell 类型等差异）。

---

## 7. 发布到 VS Code Marketplace

### 7.1 获取 Personal Access Token

1. 登录 [Azure DevOps](https://dev.azure.com)
2. 创建组织（organization），名称即 `publisher` 字段的值，如 `your-publisher-id`
3. 点击右上角头像 → **Personal access tokens** → **New Token**
4. 设置：
   - **Name**：`vscode-publish`（任意）
   - **Organization**：选择刚创建的组织
   - **Scopes**：勾选 **Marketplace (Publish)**
   - **Expiration**：建议 1 年以上
5. 复制生成的 token（只显示一次）

### 7.2 发布命令

```bash
vsce login your-publisher-id
# 粘贴上面获得的 PAT

vsce publish
```

或一步到位：

```bash
vsce publish -p <YOUR_PAT>
```

### 7.3 版本号更新

每次发布前必须递增 `version` 字段（`major.minor.patch`）：

```bash
# 小修复：0.1.0 → 0.1.1
vsce publish patch

# 小功能：0.1.0 → 0.2.0
vsce publish minor

# 大改动：0.1.0 → 1.0.0
vsce publish major
```

---

## 8. 配置 CI/CD (GitHub Actions)

### 8.1 概述

GitHub Actions 工作流在 push tag 时自动打包并发布扩展。你需要：

1. 将代码推送到 GitHub
2. 在 GitHub 仓库设置中配置 Secrets
3. 推送语义化版本 tag

### 8.2 工作流文件

在 `.github/workflows/publish.yml` 中写入：

```yaml
name: Publish VS Code Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install vsce
        run: npm install -g @vscode/vsce

      - name: Publish to Marketplace
        run: vsce publish -p ${{ secrets.VSCE_PAT }}
```

### 8.3 配置 GitHub Secrets

1. 打开 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**
3. Name：`VSCE_PAT`，Value：你在第 7.1 步获取的 PAT
4. 点击 **Add secret**

### 8.4 触发发布

```bash
# 确保工作区干净
git status

# 更新版本号（手动修改 package.json 中的 version），然后：
git add package.json
git commit -m "chore: bump version to 0.1.1"

# 创建 tag 并推送
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

GitHub Actions 检测到 `v*` tag 被推送后会自动运行工作流：
- 拉取代码
- 安装 Node.js 20
- 全局安装 `@vscode/vsce`
- 执行 `vsce publish -p $VSCE_PAT`

### 8.5 进阶 CI：带版本号同步

如果想让 tag 自动同步到 `package.json` 的 `version` 字段，可用增强版工作流：

```yaml
name: Publish VS Code Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Sync version from tag
        run: |
          TAG_VERSION=${GITHUB_REF#refs/tags/v}
          npm version --no-git-tag-version "$TAG_VERSION"

      - name: Install vsce
        run: npm install -g @vscode/vsce

      - name: Publish to Marketplace
        run: vsce publish -p ${{ secrets.VSCE_PAT }}
```

这样 `git tag v0.2.0 && git push origin v0.2.0` 即可发布，无需手动改 `package.json`。

---

## 9. 版本管理与 CHANGELOG

### 9.1 CHANGELOG.md 格式示例

```markdown
# Changelog

## [0.1.0] - 2026-05-27

### Added

- Initial release
- Support `savePipeline.sequences` setting
- VS Code command steps (`command` field)
- Shell command steps (`shell` field)
- File exclusion via glob patterns (`exclude` field)
- Placeholder expansion in shell commands
- Output Channel logging
- Command validation on startup and config change
```

### 9.2 README.md 内容

```markdown
# Save Pipeline

Run configurable sequences of VS Code commands and shell commands on file save.

## Features

- Execute any VS Code command or shell command in sequence on save
- Filter by language ID or glob patterns
- Built-in placeholders like `${file}`, `${workspaceFolder}`
- Zero dependencies (pure Node.js + VS Code API)

## Configuration

Edit your `settings.json`:

\`\`\`jsonc
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
\`\`\`

See [DESIGN.md](./DESIGN.md) for full documentation.
```

---

## 10. 常见问题

### Q: 为什么没有 `dependencies` 字段？

A: 本扩展仅使用 Node.js 内置模块（`child_process`、`path`）和 VS Code 运行时注入的 `vscode` API，无需任何第三方包。

### Q: 安装 `@vscode/vsce` 时遇到权限错误怎么办？

A: Windows 上以管理员身份运行终端。或使用 `npm config set prefix` 修改全局安装路径。

### Q: 本地调试时代码改了但不生效？

A: 在 Extension Development Host 窗口中按 `Ctrl+R` 重新加载窗口。

### Q: `executeCommand` 报错 "command not found"？

A: 检查该命令对应的扩展是否已在 Extension Development Host 中安装/启用。若在正式环境中，确保用户已安装所需扩展。

### Q: Shell 命令在 Windows 上执行失败？

A: Shell 命令默认使用系统 shell（Windows 下为 `cmd.exe`）。若需使用 PowerShell，将命令写为：
```jsonc
{ "shell": "powershell -NoProfile -Command \"your command\"" }
```

---

## 附录 A：完整文件清单及创建顺序

| 序号 | 文件 | 操作 | 内容来源 |
| :-: | :-- | :-- | :--- |
| 1 | 项目目录 | `mkdir vscode-save-pipeline && cd vscode-save-pipeline && git init` | — |
| 2 | `package.json` | `npm init -y` 后替换 | 本文档第 3 节 |
| 3 | `extension.js` | 新建 | 本文档第 4.2 节 |
| 4 | `.vscodeignore` | 新建 | 本文档第 5.1 节 |
| 5 | `.gitignore` | 新建 | 本文档第 5.2 节 |
| 6 | `LICENSE` | 新建，复制 MIT 文本 | [LICENSE](./LICENSE) |
| 7 | `README.md` | 新建 | 本文档第 9.2 节 |
| 8 | `CHANGELOG.md` | 新建 | 本文档第 9.1 节 |
| 9 | `.github/workflows/publish.yml` | 新建 | 本文档第 8.2 节 |
| 10 | 测试 (.vsix) | `vsce package` | 本文档第 6.3 节 |

---

## 附录 B：零依赖技术栈总结

```
Save Pipeline Extension
├── 运行时
│   ├── vscode API          ← VS Code 运行时注入（不需要安装）
│   ├── child_process.exec  ← Node.js 标准库
│   └── path                ← Node.js 标准库
├── 开发工具
│   └── @vscode/vsce        ← 全局安装：打包 & 发布
└── CI/CD
    └── GitHub Actions      ← ubuntu-latest + Node.js 20
```

> **项目文件大小**: extension.js &asymp; 200 行，package.json &asymp; 70 行。零编译、零构建、零依赖。
