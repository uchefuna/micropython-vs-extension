

import * as vscode from 'vscode';

import { loadRootFolder } from './utils/currentfolderstate';
import { DeviceTreeDataProvider } from './utils/DeviceTreeDataProvider';
import { registerToolbarCommands } from './utils/menutoolbar';
import { micropyProviderData } from './utils/micropyproviderdata';
import { selectingComPort } from './utils/serial';
import { activeReplActions, deactivateReplTerminals, killExistingTerminals, listeningForTerminal } from './utils/vscoderepllauncher';
import { setExtensionStarted } from './utils/xtenstate';
import { delay } from './utils/delay';

const ROOT_MULTI_FOLDER_KEY = 'micropythonMultiRootFolders';

export async function activate(
  ctx: vscode.ExtensionContext
) {
  // Listen for new terminals being opened
  listeningForTerminal(ctx);

  //Kill all existing terminals at activation
  await killExistingTerminals();
  await delay(1000);
  // await checkAndRefocusExistingTerminal(ctx);
  
  // Set up tree toolbars
  await setExtensionStarted(ctx, false);
  const subscriptions: vscode.Disposable[] = [];

  // Set up status bar toggle
  const startStopStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  startStopStatusBarItem.text = '$(play) START';
  startStopStatusBarItem.tooltip = 'Start/Stop Toggle';
  startStopStatusBarItem.command = 'micropython-vs-extension.toggleStartStop';
  startStopStatusBarItem.show();
  subscriptions.push(startStopStatusBarItem);

  // Serial port commands
  const { connectToPortIcon, disconnectToPortIcon } = selectingComPort(ctx);
  subscriptions.push(connectToPortIcon, disconnectToPortIcon);

  // Toggle command
  const toggleCommand = vscode.commands.registerCommand('micropython-vs-extension.toggleStartStop', async () => {
    vscode.window.showInformationMessage('Starting Micropython Extension...');
    console.log('[Micropython] Initializing extension startup process...');

    const { storedUris, rootFolderUri } = await loadRootFolder(ctx, ROOT_MULTI_FOLDER_KEY);
    console.log(`[Micropython] Stored URIs: ${storedUris}`);
    console.log(`[Micropython] Root Folder URI: ${rootFolderUri?.fsPath || 'not set'}`);

    // Tree View
    const treeProvider = new DeviceTreeDataProvider(ctx, ROOT_MULTI_FOLDER_KEY);
    vscode.window.registerTreeDataProvider('micropythonDeviceView', treeProvider);

    // Toolbar Commands
    registerToolbarCommands(ctx, ROOT_MULTI_FOLDER_KEY);

    // REPL Management Commands
    activeReplActions(ctx);

    // Tree UI Commands
    const { selectRootFolder, otherOperation } = micropyProviderData(ctx, treeProvider, ROOT_MULTI_FOLDER_KEY);
    subscriptions.push(selectRootFolder, otherOperation);

    // Finalize
    await setExtensionStarted(ctx, true);
    startStopStatusBarItem.command = undefined;
    startStopStatusBarItem.text = 'EXTENSION STARTED';
    vscode.window.showInformationMessage('Micropython Extension Started!');
  });

  subscriptions.push(toggleCommand);

  // Register all disposables
  ctx.subscriptions.push(...subscriptions);
}

export function deactivate() {
  console.log('Extension deactivated.');
  deactivateReplTerminals();
}
