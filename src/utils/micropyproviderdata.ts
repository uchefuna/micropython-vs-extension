

import * as vscode from 'vscode';

import { DeviceTreeDataProvider } from './DeviceTreeDataProvider';
import { getFirstRootFolder } from './currentfolderstate';

export async function addWorkspaceFolder(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string
): Promise<string | undefined> {
  let folders: string[] = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];
  console.log(`folders 1: ${folders}`);

  const folder = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Select workspace root folder'
  });

  let newFolder: string = '';
  if (folder && folder.length > 0) {
    newFolder = folder[0].toString();
    folders = [newFolder, ...folders.filter(f => f !== newFolder)].slice(0, 5);
    console.log(`folders 2: ${folders}`);
    await ctx.workspaceState.update(ROOT_MULTI_FOLDER_KEY, folders);
    vscode.window.showInformationMessage(`Folder added to saved list.`);
    console.log(`Folder added to saved list.`);
  }

  folders = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];
  console.log(`folders 3: ${folders}`);

  return newFolder;
}

export async function pickWorkspaceFolder(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string
): Promise<string | undefined> {
  const folders: string[] = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];

  let pick: string | undefined;
  if (folders.length === 0) {
    vscode.window.showWarningMessage('No stored workspace folders. Please add one.');
    console.log('No stored workspace folders. Please add one.');

    pick = await addWorkspaceFolder(ctx, ROOT_MULTI_FOLDER_KEY);

    return pick;
  }

  const action = await vscode.window.showQuickPick(
    [
      'Selct WorkSpace Folder List',
      'Add New WorkSpace Folder'
    ],
    {
      placeHolder: 'Select workspace folder from list or add new one?',
      ignoreFocusOut: true,
    },
  );
  if (!action) return;

  if (action === 'Selct WorkSpace Folder List') {
    pick = await vscode.window.showQuickPick(
      folders,
      {
        placeHolder: 'Select a stored workspace folder to use',
        ignoreFocusOut: true,
      }
    );
  } else if (action === 'Add New WorkSpace Folder') {
    vscode.window.showWarningMessage('Add new WorkSpace folder.');
    console.log('Add new WorkSpace folder.');

    pick = await addWorkspaceFolder(ctx, ROOT_MULTI_FOLDER_KEY);
  }

  return pick;
}

export async function clearStoredFolders(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string
) {
  await ctx.workspaceState.update(ROOT_MULTI_FOLDER_KEY, []);
  await ctx.globalState.update(ROOT_MULTI_FOLDER_KEY, []);
  vscode.window.showInformationMessage('Cleared all stored workspace folders.');
  console.log('Cleared all stored workspace folders.');
}


export function micropyProviderData(
  ctx: vscode.ExtensionContext,
  treeProvider: DeviceTreeDataProvider,
  ROOT_MULTI_FOLDER_KEY: string
) {
  // Command 1: Select root folder
  const selectRootFolder = vscode.commands.registerCommand('micropython-vs-extension.selectRootFolder', async () => {

    const picked = await pickWorkspaceFolder(ctx, ROOT_MULTI_FOLDER_KEY)
    console.log(`picked: ${picked}`);


    if (!picked) {
      vscode.window.showWarningMessage('No folder was selected.');
      console.log('No folder was selected.');
      return;
    }
    // Update the workspace with the selected folder
    const pickedUri = vscode.Uri.parse(picked);

    //get existing workspace folders in the saved container
    let storedFolders: string[] = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];

    if (!storedFolders.length) return;

    // 🧠 Add to front, remove duplicates, and limit to 5
    storedFolders = [picked, ...storedFolders.filter(f => f !== picked)].slice(0, 5);

    // 💾 Persist to workspace state
    await ctx.workspaceState.update(ROOT_MULTI_FOLDER_KEY, storedFolders);
    console.log('✅ Updated stored workspace folders:', storedFolders);

    // 💼 Step 1: Check if workspace is not saved
    if (!vscode.workspace.workspaceFile) {
      const save = await vscode.window.showWarningMessage(
        'You must save this workspace to persist folder additions. Do you want to save it now?',
        'Yes', 'No'
      );

      if (save === 'Yes') {
        await vscode.commands.executeCommand('workbench.action.saveWorkspaceAs');
      } else {
        vscode.window.showWarningMessage('Operation cancelled — folders not added.');
        return;
      }
    }

    // 🔒 Step 2: Re-check after saving
    if (!vscode.workspace.workspaceFile) {
      vscode.window.showErrorMessage('Workspace still not saved. Cannot continue.');
      return;
    }

    // 🧩 Add all stored folders to the workspace
    const folderObjects = storedFolders.map(uriStr => ({
      uri: vscode.Uri.parse(uriStr)
    }));;

    // Step 4: Apply to workspace
    vscode.workspace.updateWorkspaceFolders(
      0,
      vscode.workspace.workspaceFolders?.length ?? 0,
      ...folderObjects
    );

    vscode.window.showInformationMessage(`Root folder set: ${pickedUri.fsPath}`);
    console.log(`Root folder set: ${pickedUri.fsPath}`);

    // Update state and refresh tree view
    // treeProvider.setRootFolderSet(false);
  });

  // Command 2: Other operation
  const otherOperation = vscode.commands.registerCommand('micropython-vs-extension.otherOperation', async () => {

    if (!getFirstRootFolder()) {
      vscode.window.showErrorMessage('Root folder not selected yet.');
      console.log('Root folder not selected yet.');
      return;
    }

    vscode.window.showInformationMessage('Other operation executed!');
    console.log('Other operation executed!');
  });

  // Return both commands
  return { selectRootFolder, otherOperation };
}
