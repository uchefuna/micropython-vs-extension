

import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export async function buildMicropythonClean(context: vscode.ExtensionContext) {
  const IDF_PATH = '~/Development/esp/esp-idf';
  const MICROPY_PATH = '~/Development/micropython';
  const MICROPY_PORT_PATH = path.join(MICROPY_PATH, 'ports', 'esp32');
  const BOARD_NAME = 'ESP32_GENERIC_S3_CUSTOM';
  const BOARD_VARIANT = 'FLASH_16M_SPIRAM_OCT';
  const BUILD_DIR_NAME = `build-${BOARD_NAME}-${BOARD_VARIANT}`;

  const output = vscode.window.createOutputChannel('MicroPython Build');
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  // Helper: expand ~ to home
  function expandHome(p: string) {
    if (!p) return p;
    if (p.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) return path.join(home, p.slice(1));
    }
    return p;
  }

  // Helper: execute a shell command with live output to output channel
  function execShell(shell: string, cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      output.appendLine(`\n$ ${shell} (cwd: ${cwd || 'current'})`);
      const proc = exec(shell, { cwd: cwd ? expandHome(cwd) : undefined });

      proc.stdout?.on('data', data => output.append(data.toString()));
      proc.stderr?.on('data', data => output.append(data.toString()));

      proc.on('error', err => reject(err));
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Command failed with exit code ${code}`));
      });
    });
  }

  // The commands sequence
  const commands = [
    {
      label: 'Sourcing ESP-IDF environment',
      shell: `. ${expandHome(IDF_PATH)}/export.sh`,
      cwd: undefined,
    },
    {
      label: `Removing build directory ${BUILD_DIR_NAME}`,
      shell: `rm -rf ${BUILD_DIR_NAME}`,
      cwd: expandHome(MICROPY_PORT_PATH),
    },
    {
      label: 'Running idf.py fullclean',
      shell: `idf.py fullclean`,
      cwd: expandHome(MICROPY_PORT_PATH),
    },
    {
      label: `make clean for board ${BOARD_NAME}`,
      shell: `make BOARD=${BOARD_NAME} clean`,
      cwd: expandHome(MICROPY_PORT_PATH),
    },
    {
      label: 'Cleaning mpy-cross',
      shell: 'make -C mpy-cross clean',
      cwd: expandHome(MICROPY_PATH),
    },
    {
      label: 'Building mpy-cross',
      shell: 'make -C mpy-cross',
      cwd: expandHome(MICROPY_PATH),
    },
    {
      label: `Building MicroPython firmware for ${BOARD_NAME}`,
      shell: `make BOARD=${BOARD_NAME} BOARD_VARIANT=${BOARD_VARIANT}`,
      cwd: expandHome(MICROPY_PORT_PATH),
    },
  ];

  output.show(true);
  statusBar.show();

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'MicroPython Clean Build',
      cancellable: false
    }, async (progress) => {
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        const percent = Math.floor(((i) / commands.length) * 100);
        progress.report({ message: cmd.label, increment: percent });
        statusBar.text = `$(gear) MP Build: ${cmd.label}`;
        statusBar.tooltip = `Running: ${cmd.shell}`;
        await execShell(cmd.shell, cmd.cwd);
      }
      progress.report({ message: 'Build completed!', increment: 100 });
      statusBar.text = '$(check) MP Build completed';
    });

    vscode.window.showInformationMessage('MicroPython clean build completed successfully!');
  } catch (error: any) {
    statusBar.text = '$(error) MP Build failed';
    vscode.window.showErrorMessage(`MicroPython build failed: ${error.message}`);
    output.appendLine(`\nERROR: ${error.message}`);
  } finally {
    setTimeout(() => statusBar.hide(), 5000);
  }
}
