

import * as vscode from 'vscode';


const STAR_STATE_KEY = 'micropythonExtensionStartedé';

export async function setExtensionStarted(
  ctx: vscode.ExtensionContext,
  value: boolean
) {
  await ctx.globalState.update(STAR_STATE_KEY, value);
}

export function getExtensionStarted(
  ctx: vscode.ExtensionContext,
) {
  return ctx.globalState.get<boolean>(STAR_STATE_KEY) ?? false;;
}
