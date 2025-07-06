

import * as vscode from "vscode";
import { eraseFlash, writeFirmware } from "../utils/esptool";


export async function micropythonFlasher(
  port: string,
): Promise<void> {
  // 1. Pick firmware file
  const filePick = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Flash this firmware",
    filters: { "Firmware binaries": ["bin"] },
  });

  if (!filePick || filePick.length === 0) {
    vscode.window.showInformationMessage("Firmware flashing cancelled.");
    console.log("Firmware flashing cancelled.");
    return;
  }
  const firmwarePath = filePick[0].fsPath;

  // 2. Run flashing steps
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Flashing MicroPython firmware",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Erasing flash (this can take ~10's)…", increment: 20 });
        await eraseFlash(port);

        progress.report({ message: "Writing firmware…", increment: 50 });
        await writeFirmware(port, firmwarePath);

        progress.report({ message: "Flash complete rebooting board…", increment: 80 });
      },
    );

    vscode.window.showInformationMessage("Firmware flashed successfully!");
    console.log("Firmware flashed successfully!");

    // 3. Optional: wait a moment then run your existing upload
    // setTimeout(() => uploadWorkspace(context), 2500);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Flashing failed: ${err.message}`);
    console.log(`Flashing failed: ${err.message}`);
  }
}
