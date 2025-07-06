

import * as vscode from "vscode";
import {
  eraseFlash,
  writeFirmware,
  waitForProcess,
  readChipInfo,
} from "../utils/esptoolauto";
import { delay } from '../utils/delay';
import { killActiveTerminalAndGetPort } from "../utils/serial";
import { selectFirmware, updateFirmwareHistory } from '../utils/flashFirmware'
import { launchReplWithTerminalPicker } from '../utils/vscoderepllauncher'


export async function micropythonFlasherAuto(
  ctx: vscode.ExtensionContext,
  destPath?: string
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("micropython.flash");
  const baud = cfg.get<number>("baudRate", 921600);
  const autoDir = cfg.get<string>("autoSearchDir", "");
  const otaChunk = cfg.get<number>("otaChunkSize", 1024);

  // ---- choose firmware file (picker or auto) ----
  let firmwarePath: string | undefined;

  const pick = await vscode.window.showQuickPick(
    [
      "Use newly built firmware.",
      "Choose bin manually…",
      "Use newest saved in build folder"
    ],
    { placeHolder: "Select firmware source" },
  );

  if (pick === "Use newly built firmware.") {
    firmwarePath = destPath;
    if (destPath) await updateFirmwareHistory(ctx, destPath);
  } else if (pick === "Choose bin manually…") {
    firmwarePath = await firstSelectBinDir(ctx);
  } else if (pick === "Use newest saved in build folder") {
    firmwarePath = await selectFirmware(ctx);
    if (!firmwarePath) {
      vscode.window.showWarningMessage(`No *.bin found in ${autoDir}. Pick a file manually.`,);
      console.log(`No *.bin found in ${autoDir}. Pick a file manually.`);
      firmwarePath = await firstSelectBinDir(ctx);
    }
  }

  if (!firmwarePath) {
    vscode.window.showInformationMessage("Flashing cancelled.");
    console.log("Flashing cancelled.");
    return;
  }
  console.log(`firmwarePath: ${firmwarePath}`);

  const flashOption = await vscode.window.showQuickPick(
    [
      'Erase and Flash',
      'Flash only (no erase)'
    ],
    { placeHolder: 'Do you want to erase flash before flashing?' }
  );
  if (!flashOption) return;

  const eraseBeforeFlash = flashOption === 'Erase and Flash';
  console.log(`eraseBeforeFlash: ${eraseBeforeFlash}`);

  // let attempts = 0;
  // let port: string | undefined;

  // while (attempts < 5 && !port) {
  //   attempts++;
  //   console.log(`Killing active terminal... | Attempts: ${attempts}`);

  //   // ---- ensure port closed ----
  //   await killExistingTerminals();
  //   await delay(1000);

  //   // ---- get serial / OTA port ----
  //   port = await getUserPort(ctx);
  //   console.info(`${!port ? 'Terminal still active' : 'Terminal kill!'}`);
  // }
  // if (!port) return

  const port = await killActiveTerminalAndGetPort(ctx);

  // ---- flash inside progress UI ----
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Flashing MicroPython firmware",
      cancellable: false,
    },
    async (progress) => {
      try {
        try {
          const chipInfo = await readChipInfo(port, baud);
          vscode.window.showInformationMessage(`Device: ${chipInfo}`);
          console.log(`Device: ${chipInfo}`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Flashing failed: ${err.message}`);
          return;
        } finally {
          await delay(1000);
        }

        if (eraseBeforeFlash) {
          await eraseFlash(port, baud);
        }
        await delay(1000);

        const child = await writeFirmware(
          port,
          firmwarePath!,
          baud,
          otaChunk,
          /* dryRun  */  false,
          /* retries */  3
        );

        if (child) {
          child.stdout.on('data', (data) => {
            const match = data.toString().match(/\((\s*\d+)\s*%\)/);
            if (match) {
              const percent = parseInt(match[1], 10);
              progress.report({ increment: 0, message: `Flashing... ${percent}%` });
            }
            console.log(`[stdout]: ${data.toString()}`);
          });
          child.stderr.on('data', (data) => {
            const match = data.toString().match(/\((\s*\d+)\s*%\)/);
            if (match) {
              const percent = parseInt(match[1], 10);
              progress.report({ increment: 0, message: `Flashing... ${percent}%` });
            }
            console.error(`[stderr]: ${data.toString()}`);
          });
          child.on('error', (err) => {
            console.error('Failed to start flashing process:', err);
            vscode.window.showErrorMessage(`Flashing failed: ${err.message}`);
          });


          await waitForProcess(child);
        } else {
          vscode.window.showWarningMessage("Dry run: Firmware flashing skipped.");
        }

        vscode.window.showInformationMessage("Firmware flashed successfully!");
        console.log("Firmware flashed successfully!");

        await delay(1000);
        vscode.window.showInformationMessage(`Hard resetting device and launching REPL...`);
        console.log(`[UploaderProcess] Hard resetting device and launching REPL...`);

        await delay(1000); // Wait for 1 second before finalizing

        // 👉 Launch REPL
        await launchReplWithTerminalPicker(ctx, port, 'reset');
      } catch (err: any) {
        vscode.window.showErrorMessage(`Flashing failed: ${err.message}`);
      }
    }
  );
}


// export async function micropythonFlasherAutoExt() { 

// }


async function firstSelectBinDir(
  ctx: vscode.ExtensionContext
): Promise<string | undefined> {
  const file = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { "Firmware binaries": ["bin", "hex", "uf2"] },
  });
  if (!file?.[0]) return;
  const filePath = file[0].fsPath;
  await updateFirmwareHistory(ctx, filePath);
  return filePath;
  // return file?.[0]?.fsPath;
}

