

import { execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execFileP = promisify(execFile);

/**
 * Run esptool.py with the given arguments.
 * Throws with stderr if esptool exits non‑zero.
 */
export async function runEsptool(
  args: string[],
  port: string,
  progressMsg: string,
  baud = 460800,
): Promise<void> {
  // const esptoolBin = "esptool.py";          // or absolute path if required
  const esptoolBin = "esptool";          // or absolute path if required
  try {
    vscode.window.setStatusBarMessage(progressMsg, 3000);
    await execFileP(
      esptoolBin,
      ["--chip", "esp32s3", "--port", port, "--baud", baud.toString(), ...args],
      { encoding: "utf8" },
    );
  } catch (err: any) {
    throw new Error(
      `esptool failed (${progressMsg.toLowerCase()}): ${err.stderr || err.message}`,
    );
  }
}

/** Completely erase the flash. */
export const eraseFlash = (port: string) =>
  runEsptool(["erase_flash"], port, "Erasing flash…", 921600);

/** Write the given firmware binary at address 0x0000. */
export const writeFirmware = (port: string, binPath: string) =>
  runEsptool(["write_flash", "-z", "0x0", binPath], port, "Flashing firmware…");
