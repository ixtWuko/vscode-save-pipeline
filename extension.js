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

  context.subscriptions.push(output);

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((e) => {
      e.waitUntil((async () => {
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
              output.error(`[${seq.label ?? 'unnamed'}] ${step.command ?? step.shell} → ${String(err)}`);
              output.show(true);
              break;
            }
          }
        }
      })());
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
    .replace(/\$\{relativeFile\}/g, path.relative(wsPath, filePath) || path.basename(filePath))
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

function deactivate() {
  // output channel is auto-disposed via context.subscriptions
}

module.exports = { activate, deactivate };
