

// globals.ts (full rewrite)
// ---------------------------------------------------------------------------
// Single‑point REPL tracking + two launch strategies:
//   1. Integrated VS Code terminal  (close event detected)
//   2. Detached Windows Terminal via child_process.spawn (exit detected)
// ---------------------------------------------------------------------------
import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as util from 'util';
import * as path from 'path';

// -----------------------------
//   REPL state + helpers
// -----------------------------
export let replTerminal: vscode.Terminal | undefined; // integrated mode
export let replProcess: import('child_process').ChildProcess | null = null; // detached mode

export function isRepl(term: vscode.Terminal) {
  // return term.name.startsWith('ESP32 REPL');
  return term.name.startsWith('PowerShell Preview');
}

export function trackRepl(term: vscode.Terminal) { replTerminal = term; }

export function hasActiveRepl() {
  return !!replTerminal && vscode.window.terminals.includes(replTerminal);
}

export function disposeRepl() {
  replTerminal?.dispose();
  replTerminal = undefined;
  if (replProcess) replProcess.kill();
  replProcess = null;
}

export function sendSoftReset() {
  replTerminal?.sendText('\x04', false);
}

export function sendHardReset() {
  replTerminal?.sendText('~ reset', true);
}

export async function showReplActions() {
  if (!hasActiveRepl() && !replProcess) {
    vscode.window.showWarningMessage('No ESP32 REPL active.');
    return;
  }
  const choice = await vscode.window.showQuickPick([
    'Soft Reset (Ctrl+D)', 'Hard Reset (~ reset)', 'Close REPL'],
    { placeHolder: 'ESP32 REPL actions' });
  switch (choice) {
    case 'Soft Reset (Ctrl+D)': sendSoftReset(); break;
    case 'Hard Reset (~ reset)': sendHardReset(); break;
    case 'Close REPL': disposeRepl(); break;
  }
}

// -----------------------------
//   Settings persistence helpers
// -----------------------------
export const TARGET_KEY = 'espUploader.target';
// export const SHELL_KEY = 'espUploader.shell';
const TERMINAL_PREF_KEY = 'userPreferredTerminal';

export function getSavedTarget(ctx: vscode.ExtensionContext) {
  return ctx.globalState.get<string>(TARGET_KEY);
}

export function saveTarget(ctx: vscode.ExtensionContext, v: string) {
  ctx.globalState.update(TARGET_KEY, v);
}

export function getSavedShell(ctx: vscode.ExtensionContext): string | undefined {
  // return ctx.globalState.get<string>(SHELL_KEY);
  return ctx.globalState.get<string>(TERMINAL_PREF_KEY);
}

export async function setSaveShell(ctx: vscode.ExtensionContext, terminal: string | undefined) {
  // ctx.globalState.update(SHELL_KEY, v);
  await ctx.globalState.update(TERMINAL_PREF_KEY, terminal);
}

export async function askForTarget(
  ctx: vscode.ExtensionContext
) {
  const prev = getSavedTarget(ctx) || '192.168.4.1:8080';
  const v = await vscode.window.showInputBox({
    prompt: 'ESP target',
    value: prev
  });
  if (v) saveTarget(ctx, v);
  return v;
}

// ---------------------------------------------------------------------------
// 1) Integrated VS Code terminal launcher (tracked automatically)
// ---------------------------------------------------------------------------
export async function launchIntegratedRepl(
  ctx: vscode.ExtensionContext,
  port: string,
  reset?: string
) {
  const cmd = `mpremote connect ${port} ${reset ?? ''} repl`;
  const term = vscode.window.createTerminal({
    // name: 'ESP32 REPL',
    name: 'PowerShell Preview',
    shellPath: getDefaultShell(),
    shellArgs: getShellArgs(cmd)
  });
  term.show(true);
  trackRepl(term);
  vscode.window.onDidCloseTerminal(
    t => { if (isRepl(t)) replTerminal = undefined; }
  );
}

function getDefaultShell() {
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
}

function getShellArgs(cmd: string) {
  return process.platform === 'win32' ? ['-NoExit', '-Command', cmd] : ['-c', cmd];
}

// ---------------------------------------------------------------------------
// 2) Detached Windows Terminal launcher (monitored via ChildProcess)
// ---------------------------------------------------------------------------
export async function launchDetachedRepl(
  // ctx: vscode.ExtensionContext,
  port: string,
  profile = 'PowerShell Preview',
  reset?: string
) {
  const shellCmd = `mpremote connect ${port} ${reset ?? ''} repl`;
  // const wtArgs = ['-w', '0', 'nt', '-p', profile, '--title', 'ESP32 REPL', getProfilePrefix(profile), shellCmd];
  const wtArgs = ['-w', '0', 'nt', '-p', profile, '--title', 'PowerShell Preview', getProfilePrefix(profile), shellCmd];
  // replProcess = spawn('wt', wtArgs, { detached: true, stdio: 'ignore' });
  replProcess = spawn('wt', wtArgs);
  replProcess.unref();
  replProcess.on('exit', () => {
    replProcess = null;
    console.log('[launchDetachedRepl] Process exited.');
  });
  vscode.window.showInformationMessage(`Detached PowerShell Preview launched in ${profile}`);
  console.log(`Detached PowerShell Preview launched in ${profile}`);
}

function getProfilePrefix(
  profile: string
) {
  const p = profile.toLowerCase();
  if (p.includes('powershell')) return 'powershell -NoExit -Command';
  if (p.includes('cmd')) return 'cmd /k';
  if (p.includes('bash')) return 'bash -c';
  if (p.includes('ubuntu') || p.includes('wsl')) return 'wsl -e bash -c';
  return 'powershell -NoExit -Command';
}

// ---------------------------------------------------------------------------
// External REPL launcher using spawn() and tracking the REPL process manually
// ---------------------------------------------------------------------------
export async function launchReplWithTerminalPicker(
  ctx: vscode.ExtensionContext,
  port: string,
  reset?: string
) {
  const profiles = [
    'PowerShell Preview',
    'PowerShell',
    'Command Prompt',
    'Git Bash',
    'WSL Ubuntu'
  ];
  const savedShell = getSavedShell(ctx);

  const choice = await vscode.window.showQuickPick(
    savedShell ? [`Use saved shell [${savedShell}]`, 'Pick another shell'] : profiles,
    { placeHolder: 'Choose shell for ESP32 REPL' }
  );
  if (!choice) return;

  let shell = choice.startsWith('Use saved') ? savedShell! : await vscode.window.showQuickPick(profiles, { placeHolder: 'Select shell' });
  if (!shell) return;
  setSaveShell(ctx, shell);

  const cmd = `mpremote connect ${port} ${reset ?? ''} repl`;
  const [shellPath, args] = shellCommandWithArgs(shell, cmd);

  try {
    const proc = spawn(shellPath, args, { detached: true });
    replProcess = proc;

    vscode.window.showInformationMessage(`ESP32 REPL launched via ${shell}.`);
    console.log(`[REPL] ESP32 REPL launched via ${shell}.`);

    proc.on('exit', () => {
      replProcess = null;
      console.log('[REPL] Process exited.');
    });

    proc.stderr?.on('data',
      (data) => console.error('[REPL stderr]', data.toString())
    );
    proc.stdout?.on('data',
      (data) => console.log('[REPL stdout]', data.toString())
    );
  } catch (e: any) {
    vscode.window.showErrorMessage(`Failed to launch REPL: ${e.message}`);
    console.error('Failed to launch REPL:', e);
  }
}

function shellCommandWithArgs(profile: string, command: string): [string, string[]] {
  if (profile.includes('PowerShell'))
    return ['powershell', ['-NoExit', '-Command', command]];
    // return ['powershell.exe', ['-NoExit', '-Command', command]];
  if (profile.includes('Command Prompt'))
    return ['cmd.exe', ['/k', command]];
  if (profile.includes('Git Bash'))
    return ['C:/Program Files/Git/bin/bash.exe', ['-c', command]];
  if (profile.includes('WSL'))
    return ['wsl.exe', ['-e', 'bash', '-c', command]];
  return ['powershell.exe', ['-NoExit', '-Command', command]];
}
