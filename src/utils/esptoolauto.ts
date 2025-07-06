

import { execFile } from "child_process";
// import { promisify } from "util";
import * as fs from "fs/promises";
import * as vscode from "vscode";
import * as path from "path";
import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';

// const execFileP = promisify(execFile);

// ---------------- filesystem helpers ----------------

/** Return the newest .bin inside `dir` or undefined. */
export async function findLatestBin(dir: string): Promise<string | undefined> {
  try {
    const files = await fs.readdir(dir);
    const bins = files.filter((f) => f.endsWith(".bin"));
    if (bins.length === 0) return;
    const newest = await Promise.all(
      bins.map(async (f) => ({
        file: f,
        mtime: (await fs.stat(path.join(dir, f))).mtimeMs
      }))
    );
    newest.sort((a, b) => b.mtime - a.mtime);
    return path.join(dir, newest[0].file);
  } catch {
    return;
  }
}

// ---------------- esptool runner --------------------

// export async function runEsptool(
//   args: string[],
//   port: string,
//   status: string,
//   baud: number,
// ): Promise<void> {
//   const esptoolBin = "esptool";      // change if bundled locally

//   const portArgs = port.startsWith("esp://")
//     ? ["--port", port]                  // OTA (Wi‑Fi)
//     : ["--chip", "esp32s3", "--port", port, "--baud", baud.toString()];

//   try {
//     vscode.window.setStatusBarMessage(status, 3000);
//     await execFileP(
//       esptoolBin,
//       [...portArgs, ...args],
//       { encoding: "utf8" },
//     );
//   } catch (err: any) {
//     throw new Error(err.stderr || err.message || "esptool failed");
//   }
// }



export function runEsptool(
  args: string[],
  port: string,
  status: string,
  baud: number,
  dryRun = false
): ChildProcessWithoutNullStreams | null {
  const esptoolBin = "esptool";  // adjust path if needed

  const portArgs = port.startsWith("esp://")
    ? ["--port", port]  // OTA
    : ["--chip", "esp32s3", "--port", port, "--baud", baud.toString()];

  const finalArgs = [...portArgs, ...args];

  if (dryRun) {
    vscode.window.showInformationMessage(`Dry run: ${esptoolBin} ${finalArgs.join(' ')}`);
    console.log(`[Dry Run] ${esptoolBin} ${finalArgs.join(' ')}`);
    return null;
    // return null as unknown as import('child_process').ChildProcess; // no process spawned
  }

  vscode.window.setStatusBarMessage(status, 3000);

  // const child = spawn(esptoolBin, finalArgs, {
  //   stdio: 'pipe',
  //   shell: false,
  // });
  const child = spawn(esptoolBin, finalArgs, {
    shell: true,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
  // Ensure child process is a ChildProcessWithoutNullStreams type

  child.stderr.on('data', (data) => {
    console.error(`[esptool stderr]: ${data}`);
  });

  child.on('error', (err) => {
    console.error('Failed to start esptool:', err);
  });

  return child;
}

export async function eraseFlash(
  port: string,
  baud: number,
  dryRun = false,
  progress?: { report: (info: { increment?: number; message?: string }) => void }
): Promise<void> {
  console.log(`Starting flash erase...`);
  const child = runEsptool(['erase_flash'], port, 'Erasing flash…', baud, dryRun);
  if (child) {
    if (progress) {
      progress.report({ message: 'Erasing flash…', increment: 20 });
    }
    await waitForProcess(child);
  }
}

export async function writeFirmware(
  port: string,
  binPath: string,
  baud: number,
  otaChunk = 1024,
  dryRun = false,
  retries = 3
): Promise<ChildProcessWithoutNullStreams | null> {
  const args = port.startsWith('esp://')
    ? [
      'write_flash',
      '--compress',
      '--flash_size',
      'detect',
      '--chunk_size',
      otaChunk.toString(),
      '0x0',
      binPath,
    ]
    : ['write_flash', '-z', '0x0', binPath];

  // const child = runEsptool(args, port, 'Flashing firmware…', baud, dryRun);

  const status = 'Flashing firmware…';

  // Choose the correct esptool helper based on connection type
  const child = port.startsWith('esp://')
    ? await runEsptoolWithRetry(args, port, status, baud, retries, dryRun)
    : runEsptool(args, port, status, baud, dryRun)

  // Return null for dry run (no process spawned)
  if (!child) return null;

  // Type safety: make sure stdout/stderr are not null
  if (!child.stdout || !child.stderr) {
    throw new Error('Child process missing stdout/stderr. Check spawn options.');
  }

  return child as ChildProcessWithoutNullStreams;
}

export function waitForProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Flashing failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

//  * Reads chip info before flashing to help validate connection.
export function readChipInfo(port: string, baud: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = runEsptool(['chip_id'], port, 'Reading chip ID...', baud);
    if (!child) return reject(new Error('Dry run - no process launched.'));

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        const macMatch = output.match(/MAC: ([0-9A-F:]+)/i);
        const result = macMatch ? `MAC Address: ${macMatch[1]}` : output.trim();
        resolve(result);
      } else {
        reject(new Error(`Failed to read MAC (exit code ${code})`));
      }
    });
    // child.on('exit', (code) => {
    //   if (code === 0) resolve(output.trim());
    //   else reject(new Error(`Chip ID read failed with exit code ${code}`));
    // });
  });
}

//  * Attempts OTA with auto-retry fallback
export async function runEsptoolWithRetry(
  args: string[],
  port: string,
  status: string,
  baud: number,
  retries = 3,
  dryRun = false
): Promise<import('child_process').ChildProcess> {
  let attempt = 0;
  let lastError: any = null;

  while (attempt < retries) {
    try {
      // Dry‑run preview
      const child = runEsptool(args, port, status, baud, /*dryRun*/ true);
      // const child = runEsptool(args, port, status, baud);
      if (!child) throw new Error('Dry run - no process launched.');
      return child;
    } catch (err: any) {
      lastError = err;
      console.warn(`[OTA Retry] Attempt ${attempt + 1} failed: ${err.message}`);
      attempt++;
    }
  }

  throw new Error(`esptool failed after ${retries} attempts: ${lastError?.message || lastError}`);
}
