

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import WebSocket from 'ws'; // make sure to add this in package.json
import { delay } from './delay';
import { FileItem } from './files';
import { launchReplWithTerminalPicker } from './vscoderepllauncher';


export const TARGET_KEY = 'espUploaderWsTarget';

export function getSavedTarget(
  ctx: vscode.ExtensionContext
): string | undefined {
  return ctx.globalState.get<string>(TARGET_KEY) ?? undefined;
}

export function saveTarget(
  ctx: vscode.ExtensionContext,
  target: string
) {
  console.log(`save target: ${target}`)
  ctx.globalState.update(TARGET_KEY, target);
}

// -----------------------------------------------------------------------------
// MAIN UPLOADER
// -----------------------------------------------------------------------------
export async function wsUploaderToESP(
  ctx: vscode.ExtensionContext,
  selectedItems: FileItem[],
  workspaceRoot: string, // <-- pass workspaceFolder.uri.fsPath
  port: string // Used to launch REPL
) {
  const prev = getSavedTarget(ctx) ?? '192.168.4.6:8080';
  console.log(`prevParts: ${prev}`)

  const espipPortOption = await vscode.window.showQuickPick(
    [
      `Use default espip:port [${prev}]`,
      'Select a different espip:port'
    ],
    {
      placeHolder: 'Please choose espip:port values',
      ignoreFocusOut: true,
    }
  );
  if (!espipPortOption) return;

  let [ws_Ip, ws_Pr] = ['', ''];
  if (espipPortOption === `Use default espip:port [${prev}]`) {
    [ws_Ip, ws_Pr = '8080'] = prev.split(':');
  } else if (espipPortOption === 'Select a different espip:port') {
    const wsIp = await vscode.window.showInputBox({
      prompt: 'ESP32 IP address',
      placeHolder: '192.168.4.6',
      value: '192.168.4.6'
    });
    if (!wsIp) return;

    const wsPr = await vscode.window.showInputBox({
      prompt: 'ESP32 Port',
      placeHolder: '8080',
      value: '8080'
    });
    if (!wsPr) return;

    [ws_Ip, ws_Pr = '8080'] = [wsIp, wsPr];
  }

  console.log(`ws_Ip: ${ws_Ip}, ws_Pr: ${ws_Pr}`)

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98
  );

  const espDeleteUpload = await vscode.window.showQuickPick(
    [
      `Select to upload`,
      'Select to delete'
    ],
    {
      placeHolder: 'Please choose option to upload or delete',
      ignoreFocusOut: true,
    }
  );
  if (!espDeleteUpload) return;

  const target = `${ws_Ip}:${ws_Pr}`;
  const ws = new WebSocket(`ws://${target}/ws`);
  saveTarget(ctx, target)

  status.text = '$(sync~spin) Connecting …';
  status.show();

  // ✅ TIMEOUT WRAP
  const timeoutPromise = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      console.log('[WebSocket] Timeout triggered after 20s');
      reject(new Error('❌ WebSocket connection timeout (20 seconds).'));
    }, 20000);
  });

  // const timeoutPromise = new Promise<void>((_, reject) =>
  //   setTimeout(() => {
  //     reject(new Error('❌ WebSocket connection timeout (20 seconds).'));
  //   }, 20000)
  // );

  // ✅ Main connection promise
  const connectionPromise = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', (err) => reject(err));
    ws.once('close', () => reject(new Error('Connection closed before upload.')));
  });

  try {
    // Wait for either the connection or timeout
    await Promise.race([connectionPromise, timeoutPromise]);

    // ✅ If reached here, WebSocket is open
    console.log('[WebSocket] Connection established.');

    if (espDeleteUpload === `Select to upload`)
      UploadToRemote(ctx, ws, selectedItems, workspaceRoot, status, port)
    else if (espDeleteUpload === `Select to delete`) {
      // deleteRemoteFile(ws, status)
    }
  } catch (err: any) {
    status.dispose();
    vscode.window.showErrorMessage(`[wsUploaderToESP] ${err.message}`);
    console.error(`[wsUploaderToESP] ${err.message}`);
    ws.terminate?.(); // Kill the connection if hanging
    throw err; // 🔥 Rethrow so outer try/catch can catch it!
  }
}


async function UploadToRemote(
  ctx: vscode.ExtensionContext,
  ws: WebSocket,
  selectedItems: FileItem[],
  workspaceRoot: string,
  status: vscode.StatusBarItem,
  port: string
) {
  let uploadOk = false;   // <-- flag

  ws.once('open', async () => {
    try {
      console.log(`uploadOk: ${uploadOk}`);
      for (const item of selectedItems) {
        const paths =
          item.type === 'folder'
            ? await listAll(item.absolutePath)
            : [item.absolutePath];

        for (const p of paths) {
          await sendFileWithRetry(ws, p, workspaceRoot, status)
        }
      }

      status.text = '$(check) Upload complete';
      vscode.window.showInformationMessage('[VS]✅ Upload complete');
      console.log('[VS]✅ Upload complete');
    } catch (e: any) {
      vscode.window.showErrorMessage(`Upload error: ${e.message}`);
      console.log(`Upload error: ${e.message}`);
    } finally {
      await delay(2000);
      status.dispose();
      ws.close();
      console.log(`[Websocket upload] All done!`);
    }
  });

  ws.once('message', async (msg: WebSocket.Data) => {
    await delay(500);
    const text = msg.toString();
    console.log(`msg: ${msg}`);

    if (text.startsWith('progress:')) {
      // 1. Use a clean regex literal
      // 2. Capture two groups: done and total
      const match = text.match(/progress:(\d+)\/(\d+)/);

      if (match) {
        const [, done, total] = match;
        const percent = Math.floor((+done / +total) * 100);
        status.text = `$(sync~spin) Uploading ${percent}%`;
      }
    } else if (text.startsWith('[Remote]✅')) {
      vscode.window.showInformationMessage("✅ Upload completed successfully.");
      console.log("✅ Upload completed successfully.");
      uploadOk = true; // <-- mark success
      console.log(`uploadOk: ${uploadOk}`);
      status.text = "✅ Upload done";

    } else if (text.startsWith('[Remote]❌') || text.startsWith('⚠️')) {
      vscode.window.showErrorMessage(text);
    } else if (/^[✅⚠️❌]/.test(text)) {
      // server confirmations or errors
      vscode.window.showInformationMessage(text);
      console.log(text);
    } else {
      console.log("Server said:", text);
    }
  });

  ws.once('close', async () => {
    console.log('🛑 websocket connection closed!')

    if (uploadOk) {
      // Delay a tiny bit to ensure socket is fully freed
      await delay(1000);
      vscode.window.showInformationMessage(`Soft resetting device and launching REPL...`);
      console.log(`[UploadToRemote] Soft resetting device and launching REPL...`);

      await delay(1000); // Wait for 5 second before finalizing

      // 👉 Launch REPL
      await launchReplWithTerminalPicker(ctx, port, 'reset');
    }
  });

  ws.once('error', (err) => {
    vscode.window.showErrorMessage(`WebSocket error: ${err.message}`);
    console.log(`WebSocket error: ${err.message}`);
    status.hide();
  });
}

export async function deleteRemoteFile(
  ws: WebSocket,
  status: vscode.StatusBarItem
) {
  status.text = '$(sync~spin) Reading directory…';
  status.show();

  ws.on('open', () => ws.send(JSON.stringify({ action: 'list' })));

  ws.on('message', async (raw) => {
    const payload = JSON.parse(raw.toString());
    if (payload.action === 'list') {
      status.hide();
      const pick = await vscode.window.showQuickPick(
        payload.files,
        {
          placeHolder: 'Pick a file to delete',
          ignoreFocusOut: true,
        }
      );
      if (!pick) { ws.close(); return; }

      status.text = `$(trash) Deleting ${pick}…`;
      status.show();
      ws.send(JSON.stringify({ action: 'delete', filename: pick }));
    } else if (/^[✅❌]/.test(raw.toString())) {
      status.hide();
      vscode.window.showInformationMessage(raw.toString());
      ws.close();
    }
  });

  ws.on('error', err => {
    vscode.window.showErrorMessage('WebSocket error: ' + err.message);
    status.hide();
  });
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
async function listAll(dir: string): Promise<string[]> {
  const stat = await fs.promises.stat(dir);
  if (stat.isDirectory()) {
    const entries = await fs.promises.readdir(dir);
    const all: string[] = [];
    for (const e of entries) {
      all.push(...(await listAll(path.join(dir, e))));
    }
    return all;
  }
  return [dir];
}

async function sendFile(
  ws: WebSocket,
  filePath: string,
  workspaceRoot: string,
  status: vscode.StatusBarItem
): Promise<string> {
  const rel = path
    .relative(workspaceRoot, filePath)
    .replace(/\\\\/g, '/'); // ESP wants fwd-slashes
  const data = await fs.promises.readFile(filePath);
  const total = data.length;
  const CHUNK = 1024;

  await wsSend(ws, {
    action: 'start_upload',
    filename: rel,
    filesize: total
  });

  for (let i = 0; i < total; i += CHUNK) {
    await wsSend(ws, data.subarray(i, i + CHUNK));
    status.text = `$(sync~spin) ${rel} ${Math.floor((i / total) * 100)}%`;
  }

  // Optional small delay before finalizing
  await delay(1000);

  await wsSend(ws, {
    action: 'end_upload',
    filename: rel
  });

  return rel;
}

async function wsSend(ws: WebSocket, data: string | Uint8Array | object): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof data === 'object' && !(data instanceof Uint8Array))
        data = JSON.stringify(data);
      ws.send(data, err => (err ? reject(err) : resolve()));
    } catch (e) {
      reject(e);
    }
  });
}


// let rel: string = '';
export async function sendFileWithRetry(
  ws: WebSocket,
  filePath: string,
  workspaceRoot: string,
  status: vscode.StatusBarItem,
  retries = 5
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rel = await sendFile(ws, filePath, workspaceRoot, status);

      vscode.window.showInformationMessage(`✅ ${rel} uploaded`);
      console.log(`✅ ${rel} uploaded`);
      return; // success, exit retry loop
    } catch (err: any) {
      console.warn(`⚠️ Upload attempt ${attempt} failed: ${err.message}`);
      if (attempt === retries) {
        vscode.window.showErrorMessage(`❌ Failed to upload ${filePath}: ${err.message}`);
        console.log(`❌ Failed to upload ${filePath}: ${err.message}`);
        throw err;
      } else {
        await delay(500); // brief backoff
        console.warn(`Retrying upload for ${filePath}... [attempt ${attempt + 2}]`);
      }
    }
  }
}

async function chunksUploder(ws: WebSocket, fileUri: string, status: vscode.StatusBarItem) {
  const filename = path.basename(fileUri);
  const fileData = await fs.promises.readFile(fileUri);
  const chunkSize = 1024;
  const total = fileData.length;
  let sent = 0;

  ws.send(JSON.stringify({
    action: "start_upload",
    filename,
    filesize: total
  }));

  for (let i = 0; i < total; i += chunkSize) {
    const chunk = fileData.slice(i, i + chunkSize);
    ws.send(chunk);
    sent += chunk.length;
    status.text = `$(sync~spin) Uploading ${filename} ${Math.floor((sent / total) * 100)}%`;
  }

  ws.send(JSON.stringify({ action: "end_upload" }));
  vscode.window.showInformationMessage(`✅ ${filename} uploaded.`);
}
