

import * as path from 'path';
import * as vscode from 'vscode';
import { allOrPickAndDeleteRemote } from './allpickAnddeleteremote';
import { getFirstRootFolder } from './currentfolderstate';
import { delay } from './delay';
import { deleteProcess, deleteRemoteContentsRecursively } from './delete';
import { listAllRemoteFilesRecursively } from './devicecontent';
import { execPromise } from './execPromise';
import { FileItem, getAllFiles } from './files';
import { comPicker, stopMicroPythonScript } from './serial';
import { launchReplWithTerminalPicker, killExistingTerminals } from './vscoderepllauncher';
import { wsUploaderToESP } from './wsuploadertoesp';
import { buildManualIndentedTree } from './devicecontent';


const outputChannel = vscode.window.createOutputChannel('MicroPython Uploader');

export async function uploaderProcess(
  ctx: vscode.ExtensionContext,
  ROOT_MULTI_FOLDER_KEY: string
) {
  try {

    const quickPickFolderOptions = [
      'Use a Default Root Folder',
      'Select From Existing Root Folder List',
      'Select Another Root Folder'
    ];
    const [pickedFolderOpt1, pickedFolderOpt2, pickedFolderOpt3] = quickPickFolderOptions;

    let rootFolderOption = await vscode.window.showQuickPick(
      quickPickFolderOptions,
      {
        placeHolder: 'Please choose root folder option.',
        ignoreFocusOut: true,
      }
    );

    if (!rootFolderOption) {
      vscode.window.showWarningMessage("No root folder option selected.");
      console.log("No root folder option selected.");
      return;
    }

    let rootFolder: string = '';
    console.log(`Selected folder option: ${rootFolderOption}`);

    if (rootFolderOption === pickedFolderOpt1) {
      const folderUri = getFirstRootFolder();
      console.log(`Root folder from state: ${folderUri}`);

      if (!folderUri) {
        vscode.window.showWarningMessage("No root folder was found in default state. falling back to Select Another Root Folder logic");
        console.log("No root folder was found in default state. falling back to Select Another Root Folder logic");
      } else {
        rootFolder = folderUri.fsPath;
        console.log(`Root folder: ${rootFolder}`);
      }

      // If no folder was selected above, proceed to manual selection
      if (!rootFolder) rootFolderOption = pickedFolderOpt3;

    } else if (rootFolderOption === pickedFolderOpt2) {
      const folders: string[] = ctx.workspaceState.get(ROOT_MULTI_FOLDER_KEY) ?? [];

      if (folders.length === 0) {
        vscode.window.showWarningMessage("No folders in stored list, falling back to manual selection.");
        console.log("Stored folder list empty — falling back to Select Another Root Folder logic.");

        // Fall through to manual selection logic
      } else {
        const pickedRootFolder = await vscode.window.showQuickPick(
          folders,
          {
            placeHolder: 'Select a stored workspace folder to use',
            ignoreFocusOut: true,
          }
        );
        if (!pickedRootFolder) {
          vscode.window.showWarningMessage("No root folder was selected.");
          console.log("No root folder was selected.");
          return;
        }

        // ✅ Proper fix: convert URI string to filesystem path
        rootFolder = vscode.Uri.parse(pickedRootFolder).fsPath;
        console.log(`Picked stored folder (fsPath): ${rootFolder}`);
      }

      // If no folder was selected above, proceed to manual selection
      if (!rootFolder) rootFolderOption = pickedFolderOpt3;
    }

    if (rootFolderOption === pickedFolderOpt3 && !rootFolder) {
      console.log("Selecting another root folder manually...");
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select root folder for upload',
      });

      if (folderUri && folderUri.length > 0) {
        rootFolder = folderUri[0].fsPath;
        console.log(`Selected root folder: ${rootFolder}`);
      } else {
        vscode.window.showWarningMessage("No folder selected.");
        console.log("No folder selected.");
        return;
      }
    }

    // ✅ rootFolder is now guaranteed to be set
    console.log(`✅ Final root folder selected: ${rootFolder}`);


    // add default files/folders to exclude
    const config = vscode.workspace.getConfiguration('micropython-vs-extension');
    const defaultExclusions = config.get<string[]>('defaultExclusions') || [];
    console.log(`defaultExclusions: ${defaultExclusions.join(', ') || 'none'}`);

    const exclusionsInput = await vscode.window.showInputBox({
      prompt: 'Enter comma-separated exclusion patterns (e.g., .vscode,__pycache__,*.log)',
      placeHolder: `Leave empty to use: [${defaultExclusions.join(', ')}]`,
      ignoreFocusOut: true, // Keep input box open even if focus is lost
    });

    if (exclusionsInput === undefined) {
      vscode.window.showWarningMessage("Exclusions input left early.");
      console.log("🚫 Exclusions input left early.");
      return;
    }

    const userExclusions = exclusionsInput ? exclusionsInput.split(',').map(s => s.trim()) : [];
    console.log(`userExclusions: ${userExclusions}`);

    const combinedExclusions = Array.from(new Set([...defaultExclusions, ...userExclusions]));
    console.log(`combinedExclusions: ${combinedExclusions}`);

    // vscode.window.showInformationMessage('Device erased successfully. Proceeding with upload...');
    // console.log("Device erased successfully. Proceeding with upload...");

    const filesToUpload: FileItem[] = getAllFiles(rootFolder, combinedExclusions);
    console.log(`filesToUpload: `, filesToUpload.map(f => f.relativePath));

    if (filesToUpload.length === 0) {
      vscode.window.showWarningMessage("No files to upload after applying exclusions.");
      console.log("No files to upload after applying exclusions.");
      return;
    }

    const quickPickUploadOptions = [
      'Upload All Files/Folders',
      'Select Individual Files/Folders Manually'
    ];
    const [pickUpload1, pickUpload2] = quickPickUploadOptions;

    const uploadOption = await vscode.window.showQuickPick(
      quickPickUploadOptions,
      {
        placeHolder: 'Please choose upload mode',
        ignoreFocusOut: true,
      }
    );

    console.log(`uploadOption: ${uploadOption}`);
    if (!uploadOption) {
      vscode.window.showWarningMessage("No upload option selected.");
      console.log("No upload option selected.");
      return;
    }

    let selectedItems: FileItem[] = [];
    if (uploadOption === pickUpload1) {
      selectedItems = filesToUpload;
    } else if (uploadOption === pickUpload2) {
      // const quickPickItems = filesToUpload.map(f => ({
      //   label: f.label,
      //   description: f.description,
      //   detail: f.type === 'folder' ? '📁 Folder' : '📄 File',
      //   picked: false,  // Default select all
      //   relativePath: f.relativePath
      // }));

      // Pass array of relativePath strings to buildManualIndentedTree
      const flatTree = await buildManualIndentedTree(filesToUpload.map(f => f.relativePath), 1);
      const labelToPathMap = new Map(flatTree.map(i => [i.label, i.path]));

      const quickPickResult = await vscode.window.showQuickPick(
        // quickPickItems,
        flatTree.map(i => i.label),
        // filesToUpload,
        {
          canPickMany: true,
          placeHolder: `Select files/folders to upload  [Number of files/folders: ${filesToUpload.length || 0}]`,
          ignoreFocusOut: true,
        }
      ) || [];

      if (!quickPickResult || quickPickResult.length === 0) {
        vscode.window.showWarningMessage("No quick files/folders selected for upload.");
        console.log("No quick files/folders selected for upload.");
        return;
      }

      // Map picked items back to FileItem objects
      selectedItems = filesToUpload.filter(f =>
        quickPickResult.some(label => labelToPathMap.get(label) === f.relativePath)
      );

      // selectedItems = filesToUpload.filter(f =>
      //   quickPickResult.some(p => p.relativePath === f.relativePath)
      // );
      console.log(`Quickpick selectedItems: ${selectedItems.map(f => f.relativePath).join(', ')}`);
    }

    if (!selectedItems || selectedItems.length === 0) {
      vscode.window.showWarningMessage("No files selected for upload.");
      console.log("No files selected for upload.");
      return;
    }

    // ── confirmation ───────────────────────────────────────────────────
    const confirm = await vscode.window.showWarningMessage(
      `Please confirm to upload items ?\r\n[${selectedItems.map(f => f.label).join(', ')}]`,
      { modal: true },
      "Upload",
    );
    if (confirm !== "Upload") return;

    const confirmItems = selectedItems.map(f => f.label).join(', ');
    console.log(`Selected items for upload: ${confirmItems}`);

    const quickPickSerialOptions = [
      `Select to upload via serial port`,
      'Select to upload via microdot websocket'
    ];
    const [pickedSerail1, pickedSerail2] = quickPickSerialOptions;

    let uploadSerialOption = await vscode.window.showQuickPick(
      quickPickSerialOptions,
      {
        placeHolder: 'Please choose uploader method',
        ignoreFocusOut: true,
      }
    );
    if (!uploadSerialOption) return;

    // getting port COM
    let port = ctx.globalState.get<string>('selectedCOMPort') || '';
    console.log(`Get selected Port: ${port}`);

    const picked = await comPicker(ctx, port as string);

    if (!picked) {
      console.log('No COM ports selected. Please select a port.');
      return 0;
    }

    port = picked;

    // --- Microdot websocket uploader ---
    if (uploadSerialOption === pickedSerail2) {
      try {
        await wsUploaderToESP(ctx, selectedItems, rootFolder, port);
        return; // Success — done
      } catch (err: any) {
        vscode.window.showErrorMessage(`[wsUploaderToESP] WebSocket upload failed: ${err.message}`);
        console.error(`[wsUploaderToESP] WebSocket upload failed: ${err.message}`);

        // Ask if user wants to fallback to serial
        const fallbackChoice = await vscode.window.showQuickPick(
          [
            'Yes, upload via Serial Port',
            'No, cancel'
          ],
          {
            placeHolder: 'WebSocket upload failed. Try serial upload instead?',
            ignoreFocusOut: true,
          }
        );

        if (!fallbackChoice || fallbackChoice === 'No, cancel') {
          console.log('[Fallback] User cancelled after WebSocket failure.');
          return; // Exit early
        }

        uploadSerialOption = pickedSerail1;
      }
    }

    // --- Serial upload section (can be reached directly or via fallback) ---
    if (uploadSerialOption === pickedSerail1) {
      if (port && typeof port === 'string') {
        let attempts = 0;
        let stopScript = false;

        while (attempts < 5 && !stopScript) {
          attempts++;
          console.log(`Killing active terminal... | Attempts: ${attempts}`);

          await killExistingTerminals();
          await delay(1000);
          stopScript = await stopMicroPythonScript(port);
          console.log(`[uploadToBoard] stopScript: ${stopScript}`);

          if (!stopScript) {
            vscode.window.showErrorMessage('Failed to stop the script before upload via serial.');
            console.error('Failed to stop the script before upload via serial.');
            // return;
          } else {
            vscode.window.showInformationMessage('Stopped the script before upload via serial.');
            console.info('Stopped the script before upload via serial.');
          }
        }

        const deleteBeforeUpload = await serialDeleteBeforeUpload(uploadOption, quickPickUploadOptions, port, selectedItems);
        if (deleteBeforeUpload)
          await serialPortUploader(ctx, selectedItems, filesToUpload, port, rootFolder);
      } else {
        vscode.window.showErrorMessage('No COM port selected for serial upload.');
        console.log('[Serial Upload] COM port missing.');
      }
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Unexpected error: ${err.message}`);
    outputChannel.appendLine(`Unexpected error: ${err.message}`);
    console.log(`Unexpected error: ${err.message}`);
  }
}

async function serialDeleteBeforeUpload(
  uploadOption: string,
  quickPickUploadOptions: string[],
  port: string,
  selectedItems: FileItem[]
): Promise<boolean> {
  const [pickUpload1, pickUpload2] = quickPickUploadOptions;

  // Recursively list all items before showing quickPick
  const allRemoteItems = await listAllRemoteFilesRecursively('ampy', port, true);
  const allRemoteItemsArray = Array.isArray(allRemoteItems) ? allRemoteItems : [];
  const allRemoteItemsLength = allRemoteItemsArray.length || 0;

  console.log(`[listAllRemoteFilesRecursively] allRemoteItems: ${allRemoteItems}`);
  console.log(`[listAllRemoteFilesRecursively] allRemoteItemsArray: ${allRemoteItemsArray}`);
  console.log(`[listAllRemoteFilesRecursively] allRemoteItemsLength: ${allRemoteItemsLength}`);

  let eraseDelete = 0;

  if (uploadOption === pickUpload1 && allRemoteItems === 2) {
    vscode.window.showInformationMessage("UploadrProcess Aborted. Please make sure the device is empty before uploading. Try again.");
    console.log("UploadrProcess Aborted. Please make sure the device is empty before uploading. Try again.");
    return false;
  }

  if (uploadOption === pickUpload1 && allRemoteItemsArray && allRemoteItemsLength > 0) {
    const quickPickDeleteOptions = [
      'First Delete Method [Delete All]',
      'Second Delete Method [Delete All / Pick Items To Delete]'
    ];
    const [pickedDelete1, pickedDelete2] = quickPickDeleteOptions;

    const deleteMethod = await vscode.window.showQuickPick(
      quickPickDeleteOptions,
      {
        placeHolder: `Select which delete method to use?`,
        ignoreFocusOut: true,
      }
    );
    if (!deleteMethod) return false;

    if (deleteMethod === pickedDelete1) {
      console.log('Using first delete method');
      eraseDelete = await deleteProcess(allRemoteItemsArray, port);
    } else if (deleteMethod === pickedDelete2) {
      console.log('Using second delete method');
      eraseDelete = await allOrPickAndDeleteRemote(allRemoteItemsArray, port);
    }
    console.log(`[UploaderProcess] Erase Device: ${eraseDelete}`);

    if (eraseDelete === 0) {
      vscode.window.showErrorMessage("Device erase failed. Upload aborted.");
      console.log("Device erase failed. Upload aborted.");
      return false;
    }
    return true;
  }

  if (uploadOption === pickUpload2 && selectedItems.length > 0 && allRemoteItemsLength > 0) {
    const quickPickDelete = selectedItems.map(item => item.relativePath);
    console.log(`quickPickDelete: ${quickPickDelete.join(', ')}`);

    const normalizePath = (p: string) => p.replace(/\\/g, '/');

    const trimAllRemoteItemsArray = allRemoteItemsArray.map(path => path.replace(/^\/+/, ''));
    console.log(`trimAllRemoteItemsArray: ${trimAllRemoteItemsArray.join(', ')}`);

    // Normalize and lowercase quickPickDelete into a Set
    const allRemoteSet = new Set(quickPickDelete.map(f =>
      normalizePath(f).toLowerCase())
    );
    console.log(`allRemoteSet: ${Array.from(allRemoteSet).join(', ')}`);

    // Normalize and filter trimAllRemoteItemsArray
    const newQuickPickDelete = trimAllRemoteItemsArray.filter(item =>
      allRemoteSet.has(normalizePath(item).toLowerCase())
    );
    console.log(`newQuickPickDelete: ${newQuickPickDelete.join(', ')}`);

    // ── confirmation ───────────────────────────────────────────────────
    const confirm = await vscode.window.showWarningMessage(
      `Please confirm to upload items ?\r\n[${newQuickPickDelete.join(', ')}]`,
      { modal: true },
      "Upload",
    );
    if (confirm !== "Upload") return false;

    await deleteRemoteContentsRecursively(newQuickPickDelete, 'ampy', port);
    return true;
  }

  // Ensure a boolean is always returned
  return true;
}

export async function serialPortUploader(
  ctx: vscode.ExtensionContext,
  selectedItems: FileItem[],
  filesToUpload: FileItem[],
  port: string,
  rootFolder: string
) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Uploading files/folders to device",
      cancellable: false
    },
    async (progress) => {

      const toPosix = (p: string) => p.replace(/\\/g, '/');

      function isSubPath(parent: string, child: string): boolean {
        parent = toPosix(parent);
        child = toPosix(child);
        return child.startsWith(parent + '/') && child.length > parent.length + 1;
      }

      let uploaded = 0;
      const allFiles: FileItem[] = [];

      for (const item of selectedItems) {
        if (item.type === 'file') {
          allFiles.push(item);
        } else if (item.type === 'folder') {
          // Gather all files inside this folder (and subfolders)
          const subFiles = filesToUpload.filter(
            f => f.type === 'file' && isSubPath(item.relativePath, f.relativePath)
          );
          allFiles.push(...subFiles);
        }
      }

      const total = allFiles.length;
      console.log(`All files to upload: ${allFiles.map(f => f.relativePath).join(', ')}`);
      console.log(`Total files to upload: ${total}`);

      // console.log("Final list of files to upload:");
      // console.table(allFiles.map(f => f.relativePath));


      // Create missing folders
      const createdDirs = new Set<string>();
      for (const f of allFiles) {
        const dirPath = path.dirname(f.relativePath).replace(/\\/g, '/');
        if (dirPath !== '.' && !createdDirs.has(dirPath)) {
          const parts = dirPath.split('/');
          let acc = '';
          for (const p of parts) {
            acc = acc ? `${acc}/${p}` : p;
            if (!createdDirs.has(acc)) {
              try {
                await execPromise(`ampy -p ${port} mkdir "${acc}"`);
              } catch { }
              createdDirs.add(acc);
            }
          }
        }
      }
      console.log(`createdDirs: ${createdDirs}`);

      // Upload files one by one with progress
      for (const f of allFiles) {

        // console.log(`Uploading file: ${f.relativePath}`);
        const localPath = path.join(rootFolder, f.relativePath);
        const remotePath = f.relativePath.replace(/\\/g, '/');

        // 2⃣  upload the file (max 5 retries)
        let attempts = 0;
        let success = false;

        while (attempts < 5 && !success) {
          attempts++;
          try {
            // outputChannel.appendLine(`Uploading (${uploaded + 1}/${total}): ${f.relativePath} | Attempts: ${attempts}`);
            console.log(`Uploading (${uploaded + 1}/${total}): ${f.relativePath} | Attempts: ${attempts}`);

            await execPromise(`ampy -p ${port} put "${localPath}" "${remotePath}"`);

            success = true; uploaded++;

            progress.report({
              message: `Uploaded (${uploaded}/${total}): ${remotePath}`,
              increment: (100 / total)
            });

            console.log(`Uploaded (${uploaded}/${total}): ${remotePath}`);
          } catch (err: any) {
            outputChannel.appendLine(`Error uploading ${f.relativePath} (attempt ${attempts}): ${err.message}`);
            console.log(`Error uploading ${f.relativePath} (attempt ${attempts}): ${err.message}`);
            if (attempts >= 5) {
              vscode.window.showErrorMessage(`Failed to upload ${f.relativePath}: ${err.message}`);
              console.log(`Failed to upload ${f.relativePath}: ${err.message}`);
            }
          }
        }
      }

      // outputChannel.appendLine(`Upload completed: ${uploaded}/${total} files uploaded.`);
      vscode.window.showInformationMessage(`Upload completed: ${uploaded}/${total} files uploaded.`);
      console.log(`Upload completed: ${uploaded}/${total} files uploaded.`);

      await delay(1000);
      outputChannel.appendLine(`Hard resetting device and launching REPL...`);
      console.log(`[UploaderProcess] Hard resetting device and launching REPL...`);

      await delay(1000); // Wait for 1 second before finalizing

      // 👉 Launch REPL
      await launchReplWithTerminalPicker(ctx, port, 'reset');
    }
  );
}
