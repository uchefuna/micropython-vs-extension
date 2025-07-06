

import * as vscode from "vscode";
import { deleteRemoteContentsRecursively } from './delete';
import { buildManualIndentedTree } from './devicecontent';

/**
 * Show a QuickPick of remote files/folders and delete the user’s selection.
 *
 * @param ampyPath Path to ampy executable (e.g. "ampy")
 * @param port     Serial port (e.g. "COM22" or "/dev/ttyUSB0")
 */
export async function allOrPickAndDeleteRemote(
  deviceItem: string[],
  port: string,
  ampyPath: string = "ampy",
): Promise<number> {
  // ── 1. list remote items ──────────────────────────────────────────────
  let itemsToDelete: string[] = [];

  const quickPickDeleteOptions = [
    'Delete All Files/Folders',
    'Delete Individual Files/Folders Manually'
  ];
  const [pickedDelete1, pickedDelete2] = quickPickDeleteOptions;

  const deleteRemoteOption = await vscode.window.showQuickPick(
    quickPickDeleteOptions,
    {
      placeHolder: `Select all or pick items manually?`,
      ignoreFocusOut: true,
    }
  );
  if (!deleteRemoteOption) return 0;

  if (deleteRemoteOption === pickedDelete1) {
    itemsToDelete = deviceItem; // Select all items
  } else if (deleteRemoteOption === pickedDelete2) {

    // ── 2. quick pick ─────────────────────────────────────────────────────
    const flatTree = await buildManualIndentedTree(deviceItem);

    const labelToPathMap = new Map(flatTree.map(i => [i.label, i.path]));


    const picked = await vscode.window.showQuickPick(
      flatTree.map(i => i.label),
      // labelToPathMap,
      {
        canPickMany: true,
        placeHolder: `Select file(s)/folder(s) to delete  [Number of files/folders: ${deviceItem.length || 0}]`,
        ignoreFocusOut: true,
      }
    );
    if (!picked || picked.length === 0) return 0; // user cancelled
    // itemsToDelete = picked; // Use user’s selection
    itemsToDelete = picked.map(label => labelToPathMap.get(label)).filter((v): v is string => typeof v === 'string');
    // itemsToDelete = picked?.map(p => p.path) ?? [];
  } else {
    vscode.window.showErrorMessage("Invalid option selected.");
    console.log("Invalid option selected.");
    return 0;
  }

  // ── 3. confirmation ───────────────────────────────────────────────────
  const confirm = await vscode.window.showWarningMessage(
    `Delete selected item(s) ?\r\n[${itemsToDelete.join(", ")}]`,
    { modal: true },
    "Delete",
  );

  if (confirm !== "Delete" || itemsToDelete.length === 0) {
    vscode.window.showInformationMessage("No items selected for deletion.");
    console.log("No items selected for deletion.");
    return 0;
  }

  console.log(`Items to delete: ${itemsToDelete}, total: ${itemsToDelete.length}  `);

  // ── 4. delete with progress ───────────────────────────────────────────
  deleteRemoteContentsRecursively(itemsToDelete, ampyPath, port);
  return 2
}
