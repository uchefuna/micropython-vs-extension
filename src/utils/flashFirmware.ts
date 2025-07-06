

import * as vscode from 'vscode';
import * as path from 'path';

const FIRMWARE_HISTORY_KEY = 'firmwareHistory';

export async function selectFirmware(
  ctx: vscode.ExtensionContext
): Promise<string | undefined> {
  const history = ctx.globalState.get<string[]>(FIRMWARE_HISTORY_KEY, []);

  const options: vscode.QuickPickItem[] = [
    ...history.map(p => ({ label: path.basename(p), description: p })),
    { label: 'Browse for firmware (.bin)...' }
  ];

  const selected = await vscode.window.showQuickPick(
    options,
    { placeHolder: 'Select firmware to flash' }
  );

  if (!selected) return undefined;

  if (selected.label === 'Browse for firmware (.bin)...') {
    const file = await vscode.window.showOpenDialog({
      filters: { 'Firmware': ['bin'] },
      canSelectMany: false
    });
    if (!file?.[0]) return;
    const filePath = file[0].fsPath;
    await updateFirmwareHistory(ctx, filePath);
    return filePath;
  }

  return selected.description;
}

export async function updateFirmwareHistory(
  ctx: vscode.ExtensionContext,
  filePath: string
) {
  let history = ctx.globalState.get<string[]>(FIRMWARE_HISTORY_KEY, []);
  history = [filePath, ...history.filter(p => p !== filePath)].slice(0, 5);
  await ctx.globalState.update(FIRMWARE_HISTORY_KEY, history);
}