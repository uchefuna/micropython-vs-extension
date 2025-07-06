

import * as vscode from 'vscode';


// This variable holds the root folder URI
let rootFolderUri: vscode.Uri | undefined;

export function getFirstRootFolder(): vscode.Uri | undefined {
  return rootFolderUri;
}

export async function isRootWorkFolder(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string,
): Promise<boolean> {
  const storedUris: string[] = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  console.log('Stored URIs:', storedUris);
  console.log('Workspace folders:', workspaceFolders);

  console.log('Stored URIs length:', storedUris.length);
  console.log('Workspace folders length:', workspaceFolders.length);

  const hasStored = storedUris.length > 0;
  const hasWorkspace = workspaceFolders.length > 0;

  // Log condition
  if (!hasStored && !hasWorkspace) {
    console.log('Condition: No stored URIs and no workspace folders');
    return false;
  }

  if (hasStored && !hasWorkspace) {
    console.log('Condition: Stored URIs but no workspace folders');
  } else if (!hasStored && hasWorkspace) {
    console.log('Condition: Workspace folders but no stored URIs');
  } else {
    console.log('Condition: Both stored URIs and workspace folders present');
  }

  return true;
}

export async function loadRootFolder(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string
): Promise<{
  storedUris: string[]; rootFolderUri: vscode.Uri | undefined
}> {

  const storedUris: string[] = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  console.log(`🔄 Loading stored workspace folders:`, storedUris);
  console.log(`📂 Current workspace folders:`, workspaceFolders.map(f => f.uri.fsPath).join(', ') || 'None');

  // Try to use stored folder at index 0
  if (storedUris.length > 0) {
    const firstStoredUri = vscode.Uri.parse(storedUris[0]);
    const isAlreadyInWorkspace = workspaceFolders.some(f => f.uri.toString() === firstStoredUri.toString());

    rootFolderUri = firstStoredUri;

    if (!isAlreadyInWorkspace) {
      vscode.workspace.updateWorkspaceFolders(workspaceFolders.length, null, { uri: rootFolderUri });
      vscode.window.showInformationMessage(`📁 Restored workspace folder: ${rootFolderUri.fsPath}`);
      console.log(`✅ Added folder to workspace: ${rootFolderUri.fsPath}`);
    } else {
      console.log(`ℹ️ Folder already present in workspace: ${rootFolderUri.fsPath}`);
    }
  }
  // Fallback: use first opened folder
  else if (workspaceFolders.length > 0) {
    rootFolderUri = workspaceFolders[0].uri;
    console.log(`📁 No stored folder, using existing workspace folder: ${rootFolderUri.fsPath}`);
  }
  // No stored or opened folders
  else {
    rootFolderUri = undefined;
    vscode.window.showWarningMessage('No root folder found. Please select one to begin.');
    console.log('⚠️ No stored root folder and no workspace folders open.');
  }

  return { storedUris, rootFolderUri };
}

export function isRootFolderSet(): boolean {
  return rootFolderUri !== undefined;
}
