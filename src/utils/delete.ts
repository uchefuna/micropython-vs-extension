

import * as vscode from 'vscode';
import { delay } from './delay';
import { execPromise } from './execPromise';
import { allOrPickAndDeleteRemote } from './allpickAnddeleteremote';
import { listAllRemoteFilesRecursively } from './devicecontent';
import { killActiveTerminalAndGetPort } from './serial';

const outputChannel = vscode.window.createOutputChannel('MicroPython Uploader');

export async function deleteRemoteContentsRecursively(
  deviceContent: string[],
  ampyPath: string,
  port: string,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Deleting files on device...",
      cancellable: false
    },
    async (progress) => {
      // vscode.window.showInformationMessage(`Deleting remote files/folders...`);
      console.log(`Deleting remote files/folders...`);

      const total = deviceContent.length;
      for (let i = 0; i < total; i++) {
        await delay(1000);
        const item = deviceContent[i];

        // Recursively delete subfolders or delete file
        const itemNormalized = item.replace(/\\/g, '/'); // Ensure forward slashes
        const isProbablyFile = itemNormalized.includes('.');

        console.log(`itemNormalized: ${itemNormalized}`);
        console.log(`isProbablyFile: ${isProbablyFile}`);

        try {
          // const rmCmd = `${ampyPath} -p ${port} rm ${item}`;
          outputChannel.appendLine(`  [Deleting file: ${itemNormalized} (${i + 1}/${total})]`);
          console.log(`Deleted file: ${itemNormalized} (${i + 1}/${total})`);

          const rmCmd = `${ampyPath} -p ${port} rm ${itemNormalized}`;
          await execPromise(rmCmd);

          progress.report({
            message: `Deleted file: ${itemNormalized} (${i + 1}/${total})`,
            increment: (1 / total) * 100,
          });
          // vscode.window.showInformationMessage(`Deleted file: ${itemNormalized}`);
          console.log(`Deleted file: ${itemNormalized}`);
        } catch (err: any) {
          // Some MicroPython firmwares fail on 'rm' if file is a folder
          if (isProbablyFile) {
            // vscode.window.showErrorMessage(`Failed to delete file: ${itemNormalized}, reason: ${err.message}`);
            outputChannel.appendLine(`Failed to delete file: ${itemNormalized}, reason: ${err.message}`);
            console.error(`Failed to delete file: ${itemNormalized}, reason: ${err.message}`);
            continue; // don't try rmdir
          }

          // Retry as directory
          try {
            // const rmdirCmd = `${ampyPath} -p ${port} rmdir ${item}`;
            outputChannel.appendLine(`   [Deleting directory: ${itemNormalized} (${i + 1}/${total})]`);
            console.info(`Deleting directory: ${itemNormalized} (${i + 1}/${total})`);

            const rmdirCmd = `${ampyPath} -p ${port} rmdir ${itemNormalized}`;
            await execPromise(rmdirCmd);

            progress.report({
              message: `Deleted directory: ${itemNormalized} (${i + 1}/${total})`,
              increment: (1 / total) * 100,
            });
            // vscode.window.showInformationMessage(`Deleted directory: ${itemNormalized}`);
            console.info(`Deleted directory: ${itemNormalized}`);
          } catch (rmdirErr: any) {
            // vscode.window.showErrorMessage(`Failed to delete: ${itemNormalized}, reason: ${rmdirErr.message}`);
            outputChannel.appendLine(`Failed to delete: ${itemNormalized}, reason: ${rmdirErr.message}`);
            console.error(`Failed to delete: ${itemNormalized}, reason: ${rmdirErr.message}`);
          }
        }
      }

      vscode.window.showInformationMessage(`${total} files/folders deleted.`);
      console.log(`${total} files/folders deleted.`);
    }
  );
}

export async function deleteProcess(
  deviceItem: string[],
  port: string
): Promise<number> {
  // await delay(2000); // Wait for 2 second before proceeding

  // ── confirmation ───────────────────────────────────────────────────
  const confirm = await vscode.window.showWarningMessage(
    `Do you really want delete device content ?\r\n[${deviceItem.join(", ")}]`,
    { modal: true },
    "Delete",
  );
  if (confirm !== "Delete") return 0;

  try {
    vscode.window.showInformationMessage(`Deleting remote files: [${deviceItem.join(', ')}] on device...`);
    console.log(`Deleting remote files: [${deviceItem.join(', ')}] on device...`);

    await deleteRemoteContentsRecursively(deviceItem, 'ampy', port);
    // await deleteWithMpremote(deviceItem, port);
    vscode.window.showInformationMessage(`Remote files deleted successfully.`);
    console.log(`Remote files deleted successfully.`);
    return 2;
  } catch (err: any) {
    vscode.window.showWarningMessage(`Failed to delete remote files: ${err.message}`);
    console.log(`Failed to delete remote files: ${err.message}`);
    return 0;
  }

  return 0;
}

export async function listOrDeleteRemoteContnt(
  ctx: vscode.ExtensionContext,
  listEraseFlag?: boolean,
): Promise<void> {
  const selectedPort = await killActiveTerminalAndGetPort(ctx);

  // Recursively list all items before showing quickPick
  const allRemoteItems = await listAllRemoteFilesRecursively('ampy', selectedPort, true);
  const allRemoteItemsArray = Array.isArray(allRemoteItems) ? allRemoteItems : [];
  const allRemoteItemsLength = allRemoteItemsArray.length || 0;

  console.log(`[listAllRemoteFilesRecursively] allRemoteItemsArray: ${allRemoteItemsArray.join(', ')}`);
  console.log(`[listAllRemoteFilesRecursively] allRemoteItemsLength: ${allRemoteItemsLength}`);

  if (listEraseFlag) {
    // await vscode.window.showWarningMessage(
    //   `Avaable contents on device:\r\n[${allRemoteItemsArray.join(', ')}]\r\n\r\nNumber on content: ${allRemoteItemsLength}`,
    //   { modal: true },
    // );

    const channel = vscode.window.createOutputChannel("Device Contents");
    channel.clear();
    channel.appendLine("📁 Available contents on device:");
    channel.appendLine("---------------------------------");
    allRemoteItemsArray.forEach(item => channel.appendLine(item));
    channel.appendLine(`\nTotal: ${allRemoteItemsLength}`);
    channel.show();

    // showDeviceContentWebView(allRemoteItemsArray, allRemoteItemsLength);

    return;
  }

  if (!allRemoteItemsArray || allRemoteItemsLength === 0) {
    vscode.window.showInformationMessage(`[eraseDevice] ${!allRemoteItemsArray ? 'user cancelled.' : 'No files found on device'}`);
    console.log(`[eraseDevice] ${!allRemoteItemsArray ? 'user cancelled.' : 'No files found on device'}`);
    return;
  }

  const quickPickDeleteOptions = [
    'First Delete Method [Delete All]',
    'Second Delete Method [Delete All / Pick Items To Delete]'
  ];
  const [pickedDelete1, pickedDelete2] = quickPickDeleteOptions;

  const pickMethod = await vscode.window.showQuickPick(
    quickPickDeleteOptions,
    {
      placeHolder: `Select delete method`,
      ignoreFocusOut: true,
    }
  );
  if (!pickMethod) return;

  if (pickMethod === pickedDelete1)
    await deleteProcess(allRemoteItemsArray, selectedPort);
  else if (pickMethod === pickedDelete2)
    await allOrPickAndDeleteRemote(allRemoteItemsArray, selectedPort);
}

export function showDeviceContentWebView(
  allRemoteItemsArray: string[],
  allRemoteItemsLength: number
) {
  const panel = vscode.window.createWebviewPanel(
    'deviceContentView', // Webview ID
    '📁 Device Content Browser', // Title shown in tab
    vscode.ViewColumn.One, // Show in first editor column
    { enableScripts: false } // Scripts disabled for safety
  );

  const contentHTML = allRemoteItemsArray
    .map((item, index) => `${index + 1}. ${item}`)
    .join('<br>');

  panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          background-color: #1e1e1e;
          color: #ffffff;
          font-family: Consolas, monospace;
          padding: 20px;
        }
        h2 {
          color: #00ffcc;
        }
        .file-list {
          margin-top: 1rem;
          font-size: 14px;
          line-height: 1.6;
        }
        .footer {
          margin-top: 1.5rem;
          font-style: italic;
          color: #bbbbbb;
        }
      </style>
    </head>
    <body>
      <h2>📦 Contents on Device</h2>
      <div class="file-list">${contentHTML}</div>
      <div class="footer">Total files/folders: ${allRemoteItemsLength}</div>
    </body>
    </html>
  `;
}
