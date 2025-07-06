

import * as vscode from 'vscode';
import { SerialPort } from 'serialport';
import { DelimiterParser } from '@serialport/parser-delimiter';
import { delay } from './delay';
import { getExtensionStarted } from './xtenstate';
import { killExistingTerminals } from './vscoderepllauncher';

const selectedPortKey = 'selectedCOMPort';

let statusBarItem: vscode.StatusBarItem;
let selectedPort: string | undefined;
let activePort: SerialPort | null = null;
let isConnected: boolean = false;
let isConnecting: boolean = false;

export function selectingComPort(
  ctx: vscode.ExtensionContext
) {
  selectedPort = ctx.globalState.get<string>(selectedPortKey) || undefined;
  console.log(`Initializing COM port: ${selectedPort}`)
  initStatusBar();


  const connectToPortIcon = vscode.commands.registerCommand('micropython-vs-extension.connectToPortIcon', async () => {
    const isStarted: boolean = getExtensionStarted(ctx);
    console.log(`[connectToPortIcon]isStarted: ${isStarted}`);
    if (isStarted) {
      const status = await connectToDevice(ctx);
      console.log(`Connect status: ${status}`);
    }
  });

  const disconnectToPortIcon = vscode.commands.registerCommand('micropython-vs-extension.disconnectFromPortIcon', async () => {
    const isStarted: boolean = getExtensionStarted(ctx);
    console.log(`[disconnectFromPortIcon]isStarted: ${isStarted}`);
    if (isStarted) {
      const choice = await vscode.window.showQuickPick(
        ['NO', 'YES', 'YES [Without Deleting Storage]'],
        { placeHolder: `Delete existing COM port: [${selectedPort}]?` }
      );
      if (!choice || choice === 'NO' || !activePort) return;

      const clean = choice === 'YES';
      await disconnectFromDevice(ctx, !clean);
    }
  });

  return { connectToPortIcon, disconnectToPortIcon };
}

function initStatusBar() {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  isConnected = true;
  updateStatusBar();
  statusBarItem.show();
  vscode.commands.executeCommand('setContext', 'isConnected', true);
}

function updateStatusBar() {
  const message = isConnected ? 'Device Disconnected' : 'Device Connected';
  const icon = isConnected ? '$(debug-disconnect)' : '$(plug)';
  statusBarItem.text = `${icon} ${message}`;
  vscode.commands.executeCommand('setContext', 'isConnected', isConnected);
  vscode.window.showInformationMessage(message);
  console.log(`Device status: ${message}`);
}

export async function connectToDevice(ctx: vscode.ExtensionContext): Promise<number> {
  if (isConnecting) return 0;
  isConnecting = true;

  try {
    const picked = await comPicker(ctx, selectedPort || '');
    if (!picked) return 0;

    selectedPort = picked;
    activePort = new SerialPort({ path: selectedPort, baudRate: 115200 });

    return await new Promise((resolve) => {
      activePort!.once('open', async () => {
        ctx.globalState.update(selectedPortKey, selectedPort);
        isConnected = false;
        updateStatusBar();
        resolve(1);
      });
      activePort!.once('error', (err) => {
        vscode.window.showErrorMessage(`Connection error: ${err.message}`);
        resolve(2);
      });
    });
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to connect: ${err.message}`);
    return 0;
  } finally {
    await delay(1000);
    isConnecting = false;
  }
}

export async function disconnectFromDevice(
  ctx: vscode.ExtensionContext,
  preservePort = false
): Promise<boolean> {
  try {
    if (activePort?.isOpen) {
      await new Promise<void>((resolve, reject) => {
        activePort!.close((err) => err ? reject(err) : resolve());
      });
    }
    vscode.window.showInformationMessage('Disconnected from device.');
    isConnected = true;
    updateStatusBar();
  } catch (err: any) {
    vscode.window.showErrorMessage(`Error closing port: ${err.message}`);
    return false;
  } finally {
    await delay(1000);
    if (!preservePort) {
      selectedPort = undefined;
      ctx.globalState.update(selectedPortKey, null);
    }
    activePort = null;
  }
  return true;
}

export async function comPicker(
  ctx: vscode.ExtensionContext,
  fallback: string
): Promise<string | undefined> {
  const ports = await SerialPort.list();
  if (ports.length === 0) {
    vscode.window.showWarningMessage('No COM ports detected.');
    return;
  }

  const picked = ports.some(p => p.path === fallback)
    ? fallback
    : await vscode.window.showQuickPick(
      ports.map(p => p.path),
      { placeHolder: 'Select a COM port to connect' }
    );

  if (picked) ctx.globalState.update(selectedPortKey, picked);
  return picked;
}

export async function getUserPort(
  ctx: vscode.ExtensionContext
): Promise<string | undefined> {
  let selectedPort = ctx.globalState.get<string>('selectedCOMPort') ?? '';
  const picked = await comPicker(ctx, selectedPort);

  if (!picked) {
    vscode.window.showWarningMessage('No COM port selected. Please try again.');
    console.warn('No COM port selected. Please try again.');
    return undefined;
  }

  const stopped = await stopMicroPythonScript(picked);
  if (!stopped) {
    vscode.window.showErrorMessage('Could not stop script on selected port.');
    console.error('Could not stop script on selected port.');
    return undefined;
  }

  return picked;
}

export async function stopMicroPythonScript(
  portName: string,
  baud = 115200
): Promise<boolean> {
  const CTRL_C = Buffer.from([0x03]);
  let port: SerialPort | undefined;

  try {
    port = new SerialPort({ path: portName, baudRate: baud });
    await new Promise((resolve, reject) => {
      port!.once('open', resolve);
      port!.once('error', reject);
    });

    const parser = port.pipe(new DelimiterParser({ delimiter: '\r\n' }));
    parser.on('data', line => console.log(`[MicroPython] ${line}`));

    await delay(1000);
    for (let i = 0; i < 4; i++) {
      port.write(CTRL_C);
      await delay(100);
    }
    await delay(1000);
    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Error sending Ctrl+C: ${err.message}`);
    console.error(`Error sending Ctrl+C: ${err.message}`);
    return false;
  } finally {
    await delay(1000);
    if (port?.isOpen) port.close();
    console.log(`Port: ${port} closed successfully`)
  }
}

export function isConnectedPort(): boolean {
  return !!activePort;
}

export async function getSelectedPortFun() {
  return {
    activePort,
    getSelectedPort: selectedPort || null,
    isPortOpened: activePort ? `Port status: ${activePort.isOpen}` : null,
  };
}

export async function killActiveTerminalAndGetPort(
  ctx: vscode.ExtensionContext,
  max_retry: number = 5,
): Promise<string> {

  let attempts = 0;
  let port: string | undefined;

  while (attempts < max_retry && !port) {
    attempts++;
    console.log(`Killing active terminal... | Attempts: ${attempts}`);

    // ---- ensure port closed ----
    await killExistingTerminals();
    await delay(1000);

    // ---- get serial / OTA port ----
    port = await getUserPort(ctx);
    console.info(`${!port ? 'Terminal still active' : 'Terminal kill!'}`);
  }
  
  if (!port) {
    throw new Error('Failed to get a valid COM port after multiple attempts.');
  }
  return port;
}
