

import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { delay } from '../utils/delay';
import { getUserPort } from "../utils/serial";
import { micropythonFlasherAuto } from './micropyflasherauto';
import { launchReplWithTerminalPicker, killExistingTerminals } from '../utils/vscoderepllauncher'

// storage keys -------------------------------------------------------------
const LAST_BOARD_KEY = 'mp.build.lastBoard';
const LAST_VARIANT_KEY = 'mp.build.lastVariant';

interface BuildSettings {
  distro: string;
  scriptPath: string;
  boards: Record<string, string | string[]>;
  binName: string;
  buildDirTemplate: string;
  flashPort: string;
  autoFlash: boolean;
}

function getSettings(): BuildSettings {
  const cfg = vscode.workspace.getConfiguration('micropython.build');
  return {
    distro: cfg.get('distro', 'Ubuntu'),
    scriptPath: cfg.get('scriptPath', '/home/uchebuntu/Development/build-micropython.sh'),
    boards: cfg.get('boards', { ESP32_GENERIC_S3_CUSTOM: 'FLASH_16M_SPIRAM_OCT' }),
    binName: cfg.get('binName', 'firmware.bin'),
    buildDirTemplate: cfg.get(
      'buildDirTemplate',
      '/home/uchebuntu/Development/micropython/ports/esp32/build-%BOARD%-%VARIANT%',
    ),
    flashPort: cfg.get('flashPort', 'COM22'),
    autoFlash: cfg.get('autoFlash', false),
  } as BuildSettings;
}

function linuxToUNC(linuxPath: string, distro: string): string {
  return `\\\\wsl.localhost\\${distro}\\${linuxPath
    .replace(/^\//, '')
    .replace(/\//g, '\\')}`;
}

export async function runMicroPythonCleanBuild(
  ctx: vscode.ExtensionContext
) {
  const settings = getSettings();

  // 1️⃣  resolve board + variant -----------------------------------------
  const { board: BOARD_NAME, variant: BOARD_VARIANT } = await selectBoardVariant(ctx, settings);
  if (!BOARD_NAME || !BOARD_VARIANT) return; // user cancelled
  console.log(`Selected board: ${BOARD_NAME}, variant: ${BOARD_VARIANT}`);

  // build dir
  const buildDirLinux = settings.buildDirTemplate
    .replace('%BOARD%', BOARD_NAME)
    .replace('%VARIANT%', BOARD_VARIANT);

  // output + status bar
  const out = vscode.window.createOutputChannel('MicroPython Clean Build');
  out.clear();
  out.show(true);

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  sb.text = '$(sync~spin) Building MicroPython…';
  sb.tooltip = 'Running clean build script inside WSL';
  sb.show();
  ctx.subscriptions.push(sb);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Building MicroPython firmware…',
        cancellable: false,
      },
      () => execBuildScript(out, settings, BOARD_NAME, BOARD_VARIANT),
    );

    // 2️⃣  copy firmware --------------------------------------------------
    const srcLinux = path.posix.join(buildDirLinux, settings.binName);
    const srcWin = linuxToUNC(srcLinux, settings.distro);
    const ext = path.extname(settings.binName).slice(1);

    const destPath = await promptFirmwareDestination(ctx, BOARD_NAME, ext);
    if (!destPath) {
      out.appendLine('❌ Firmware copy cancelled by user.');
      vscode.window.showInformationMessage('Firmware copy cancelled.');
      console.log('❌ Firmware copy cancelled by user.');
      return;
    }

    await fsp.copyFile(srcWin, destPath);
    ctx.globalState.update('lastFirmwareSaveDir', path.dirname(destPath));
    vscode.window.showInformationMessage(`Firmware saved to ${destPath}`);

    vscode.window.showInformationMessage('✅ MicroPython build completed!');
    out.appendLine(`\n✅ Build completed! Firmware copied to ${destPath || 'not specified'}`);
    console.log(`\n✅ Build completed! Firmware copied to ${destPath || 'not specified'}`);

    sb.text = '$(check) Build OK';

    const flashOption = await vscode.window.showQuickPick(
      ['NO', 'YES'],
      { placeHolder: 'Do you want to continue to flashing?' }
    );

    if (flashOption === 'YES') settings.autoFlash = true;
    else return;

    // optional flash ------------------------------------------------------
    if (settings.autoFlash) {
      let port: string | undefined;

      const flashOptionMethod = await vscode.window.showQuickPick(
        ['NO', 'YES'],
        { placeHolder: 'Do you flash with the Auto Method?' }
      );

      if (!flashOptionMethod) return;

      if (flashOptionMethod === 'YES') {
        await micropythonFlasherAuto(ctx, destPath);
      } else if (flashOptionMethod === 'NO') {
        const flashTool = await vscode.window.showQuickPick(
          ['idf.py', 'esptool.py', 'Skip'],
          { placeHolder: 'Flash with which tool?', }
        );

        if (flashTool && flashTool !== 'Skip') {

          // ---- ensure port closed ----
          await killExistingTerminals();
          await delay(1000);

          // ---- serial / OTA port ----
          port = await getUserPort(ctx);
          if (!port) return;

          await flashFirmwareWSL(ctx, out, settings, flashTool as 'idf.py' | 'esptool.py', destPath, port);
        }

        vscode.window.showInformationMessage('Firmware flashed successfully!');
        console.log(`Firmware flashed successfully!`);

        await delay(1000);
        out.appendLine(`Hard resetting device and launching REPL...`);
        console.log(`[UploaderProcess] Hard resetting device and launching REPL...`);

        await delay(1000); // Wait for 5 second before finalizing

        // 👉 Launch REPL
        await launchReplWithTerminalPicker(ctx, port as string, 'reset');
      }

      settings.autoFlash = false;
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Build failed: ${err.message || err}`);
    out.appendLine(`\n❌ Build failed: ${err.message || err}`);
    console.error('Build failed:', err);
    sb.text = '$(error) Build failed';
  } finally {
    setTimeout(() => sb.dispose(), 5000);
  }
}

//–––– choose board / variant  –––––––––––––––––––––––––––––––––––––––––––––
async function selectBoardVariant(
  ctx: vscode.ExtensionContext,
  settings: BuildSettings,
) {
  // try cached values first
  const cachedBoard = ctx.globalState.get<string>(LAST_BOARD_KEY);
  const cachedVariant = ctx.globalState.get<string>(LAST_VARIANT_KEY);
  if (cachedBoard && cachedVariant && settings.boards[cachedBoard]) {
    const variants = Array.isArray(settings.boards[cachedBoard])
      ? settings.boards[cachedBoard] as string[]
      : [settings.boards[cachedBoard] as string];
    if (variants.includes(cachedVariant)) {
      const reuse = await vscode.window.showQuickPick(['Use last (✅)', 'Pick new…'], {
        placeHolder: `Reuse last build target ${cachedBoard}/${cachedVariant}?`,
      });
      if (reuse === 'Use last (✅)') {
        return { board: cachedBoard, variant: cachedVariant };
      }
    }
  }

  // pick board
  const board = await vscode.window.showQuickPick(
    Object.keys(settings.boards),
    { placeHolder: 'Select board', }
  );
  if (!board) return { board: undefined, variant: undefined };

  // pick variant(s)
  const varSetting = settings.boards[board];
  console.log(`Selected board: ${board}, variants: ${varSetting}`);

  const variants = Array.isArray(varSetting) ? varSetting : [varSetting];
  console.log(`Variants for ${board}: ${variants}, length=${variants.length}`);
  const variant = variants.length === 1
    ? variants[0]
    : await vscode.window.showQuickPick(
      variants,
      { placeHolder: `Select variant for ${board}` }
    );
  return { board, variant };
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
}

async function promptFirmwareDestination(
  ctx: vscode.ExtensionContext,
  baseName: string,
  ext: string
): Promise<string | undefined> {
  const lastDir = ctx.globalState.get<string>('lastFirmwareSaveDir') || os.homedir();
  const defaultName = `${baseName}-${timestamp()}.${ext}`;

  let destUri = vscode.Uri.file(path.join(lastDir || os.homedir(), defaultName));

  const saveUri = await vscode.window.showSaveDialog(
    {
      title: 'Save compiled firmware',
      defaultUri: destUri,
      filters: { Firmware: ['bin', 'uf2'] },
      saveLabel: 'Save firmware',
    }
  );
  if (!saveUri) return undefined;

  const exists = await fsp
    .access(saveUri.fsPath)
    .then(() => true)
    .catch(() => false);

  if (exists) {
    const action = await vscode.window.showQuickPick(
      ['Overwrite', 'Choose new timestamp', 'Abort'],
      { placeHolder: 'File exists - what do you want to do?' },
    );
    if (action === 'Abort' || !action) return undefined;
    if (action === 'Choose new timestamp') {
      return promptFirmwareDestination(ctx, baseName, ext); // recurse
    }
  }
  return saveUri.fsPath;
}

//–––– execute build –––––––––––––––––––––––––––––––––––––––––––––––––––––––
export async function execBuildScript(
  out: vscode.OutputChannel,
  settings: ReturnType<typeof getSettings>,
  BOARD_NAME: string,
  BOARD_VARIANT: string,
): Promise<void> {
  // WSL‑side existence test (avoids exit‑127)
  await new Promise<void>((resolve, reject) => {
    const testCmd = `[ -f "${settings.scriptPath}" ]`;
    const check = spawn('wsl.exe', ['bash', '-l', '-c', testCmd]);
    check.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build script not found at ${settings.scriptPath}. Check settings.`));
    });
  });

  const buildCmd = `BOARD_NAME=${BOARD_NAME} BOARD_VARIANT=${BOARD_VARIANT} bash ${settings.scriptPath}`;
  out.appendLine(`\n▶ Running: ${buildCmd}\n`);

  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['bash', '-l', '-c', buildCmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (d) => out.append(d.toString()));
    child.stderr.on('data', (d) => out.append(d.toString()));

    child.on('error', (err) => {
      reject(new Error(`WSL launch failed: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Build script exited with code ${code}. Check Output panel for details.`));
    });
  });
}

//--------------------------------------------------------------------------
// Flash via idf.py or esptool
//--------------------------------------------------------------------------
async function flashFirmwareWSL(
  ctx: vscode.ExtensionContext,
  out: vscode.OutputChannel,
  s: BuildSettings,
  tool: 'idf.py' | 'esptool.py',
  firmwarePathWin: string,
  port: string,
) {
  const firmwarePathLinux = firmwarePathWin.replace('\\wsl.localhost', '').replace(/\\/g, '/');

  let cmd = '';
  if (tool === 'idf.py') {
    // cmd = `idf.py -p ${s.flashPort} flash`;
    cmd = `idf.py -p ${port} flash`;
  } else {
    // cmd = `esptool --chip auto --port ${s.flashPort} write_flash 0x0 ${firmwarePathLinux}`;
    cmd = `esptool --chip auto --port ${port} write_flash 0x0 ${firmwarePathLinux}`;
  }
  out.appendLine('\n▶ Flashing: ' + cmd + '\n');
  await new Promise<void>((res, rej) => {
    const p = spawn('wsl.exe', ['bash', '-l', '-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => out.append(d.toString()));
    p.stderr.on('data', (d) => out.append(d.toString()));
    p.once('error', rej);
    p.once('close', (c) => (c === 0 ? res() : rej(new Error(`flash exit ${c}`))));
  });
}
