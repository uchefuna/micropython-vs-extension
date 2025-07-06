

// commands/index.ts

import * as vscode from 'vscode';

import { micropythonFlasher } from '../commands//micropyflasher';
import { micropythonFlasherAuto } from '../commands//micropyflasherauto';
import { runMicroPythonCleanBuild } from '../commands//micropythoncleanbuild';
import { getFirstRootFolder, isRootFolderSet } from './currentfolderstate';
import { clearStoredFolders } from './micropyproviderdata';
import { getSelectedPortFun, killActiveTerminalAndGetPort } from './serial';
import { uploaderProcess } from './uploader';
import { listOrDeleteRemoteContnt } from './delete';
import { launchReplWithTerminalPicker } from './vscoderepllauncher';

export function registerToolbarCommands(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string
) {
  console.log('Registering Micropython toolbar commands...');

  const registerCommand = (name: string, callback: () => Promise<void> | void) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(name, callback));

  registerCommand(
    'micropython-vs-extension.uploadToBoard',
    async () => {
      vscode.window.showInformationMessage('Uploading to board...');
      console.log('Uploading to board...');
      await uploaderProcess(ctx, ROOT_MULTI_FOLDER_KEY);
    }
  );

  registerCommand(
    'micropython-vs-extension.openREPL',
    async () => {

      const resetOption = await vscode.window.showQuickPick(
        ['NO', 'YES'],
        {
          placeHolder: 'Reset before launching REPL?',
          ignoreFocusOut: true,
        }
      );
      if (!resetOption) return;

      const selectedPort = await killActiveTerminalAndGetPort(ctx);
      await launchReplWithTerminalPicker(ctx, selectedPort, resetOption === 'YES' ? 'reset' : undefined);
    }
  );

  registerCommand(
    'micropython-vs-extension.stopScript',
    async () => {

      const confirm = await vscode.window.showQuickPick(
        ['NO', 'YES'],
        {
          placeHolder: 'Do you really want to stop the script?',
          ignoreFocusOut: true,
        }
      );
      if (!confirm || confirm === 'NO') return;

      const selectedPort = await killActiveTerminalAndGetPort(ctx);
    }
  );

  registerCommand(
    'micropython-vs-extension.configureDevice',
    async () => {
      const { getSelectedPort, isPortOpened } = await getSelectedPortFun();
      console.log(`Selected Port: ${getSelectedPort}, isPortOpened: ${isPortOpened}`);
    }
  );

  registerCommand(
    'micropython-vs-extension.listDeviceContents',
    () => {
      vscode.window.showInformationMessage('List Device Contents triggered!');
      console.log('List Device Contents triggered!');

      listOrDeleteRemoteContnt(ctx, true);
    }
  );

  registerCommand(
    'micropython-vs-extension.eraseDeviceContents',
    async () => {
      vscode.window.showInformationMessage('Erase Device Contents triggered!');
      console.log('Erase Device Contents triggered!');

      listOrDeleteRemoteContnt(ctx);
    }
  );

  registerCommand(
    'micropython-vs-extension.openTerminalHistory',
    () => {
      const rootFolder = getFirstRootFolder();
      vscode.window.showInformationMessage(`Root folder: ${rootFolder?.fsPath || 'not set'}`);
      console.log(`Root folder: ${rootFolder ? rootFolder.fsPath : 'not set'}`);

      const isRootFolder = isRootFolderSet();
      console.log(`isRootFolder: ${isRootFolder}`)
    }
  );

  registerCommand(
    'micropython-vs-extension.resetRootFolder',
    async () => {
      const confirm = await vscode.window.showQuickPick(
        ['NO', 'YES'],
        {
          placeHolder: 'Are you sure you want to reset workspace folders?',
          ignoreFocusOut: true,
        }
      );
      if (confirm !== 'YES') return;

      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        vscode.window.showErrorMessage('No workspace folders to reset.');
        console.error('No workspace folders to reset.');
        return;
      }

      await ctx.workspaceState.update('micropythonRootFolders', undefined);
      await ctx.globalState.update('micropythonRootFolders', undefined);

      await clearStoredFolders(ctx, ROOT_MULTI_FOLDER_KEY);
      vscode.workspace.updateWorkspaceFolders(0, folders.length);
      vscode.window.showInformationMessage('Workspace folders reset successfully.');
      console.log('Workspace folders reset successfully.');
    }
  );

  registerCommand(
    // Pick firmware.bin from a location to flash to borad
    'micropython-vs-extension.micropythonFlashFirmware',
    async () => {
      const selectedPort = await killActiveTerminalAndGetPort(ctx);
      await micropythonFlasher(selectedPort);
    }
  );

  registerCommand(
    // Pick firmware from a location or Use newest in build folder to flash to borad
    'micropython-vs-extension.micropythonFlashFirmwareAuto',
    async () => {
      await micropythonFlasherAuto(ctx);
    }
  );

  registerCommand(
    // Build clean micropython firmware/save it with timestamp/flash
    'micropython-vs-extension.microPythonCleanBuild',
    async () => {
      await runMicroPythonCleanBuild(ctx);
    }
  );
}
