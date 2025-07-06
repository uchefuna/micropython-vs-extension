

import * as vscode from 'vscode';
import { execPromise } from './execPromise';

export async function checkRemoteIsEmpty(
  ampyPath: string,
  port: string,
): Promise<string[] | number> {
  try {
    const listCmd = `${ampyPath} -p ${port} ls`;
    const output = await execPromise(listCmd);
    const files = output.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (files.length === 0)   return 1; // Return 1 to indicate no files found

    const deleteRemote = await vscode.window.showQuickPick(
      ['NO', 'YES'],
      {
        placeHolder: `Delete existing files/folders on device?`,
        ignoreFocusOut: true,
      }
    );

    console.log(`deleteRemote: ${deleteRemote}`);
    if (deleteRemote === 'NO') return 2; // Return 2 to indicate deletion cancelled

    return files;
  } catch (rmdirErr: any) {
    console.log(`Failed to get list of files due to: ${rmdirErr.message}`);
    throw rmdirErr;  // <-- Throw the error so the caller can handle it
  }
}

export async function listAllRemoteFilesRecursively(
  ampyPath: string,
  port: string,
  confirmDeleteRemote: boolean,
  path: string = '',
): Promise<string[] | number> {
  const files: string[] = [];

  try {
    const listCmd = `${ampyPath} -p ${port} ls ${path}`;
    const output = await execPromise(listCmd);
    const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (confirmDeleteRemote) {
      if (lines.length === 0)  return 1; // Return 1 to indicate no files found

      const deleteRemote = await vscode.window.showQuickPick(
        ['NO', 'YES'],
        {
          placeHolder: `Delete existing files/folders on device?`,
          ignoreFocusOut: true,
        }
      );
      if (!deleteRemote) return 0;

      console.log(`deleteRemote: ${deleteRemote}`);
      if (deleteRemote === 'NO')  return 2; // Return 2 to indicate deletion cancelled
    }

    for (const item of lines) {

      // Recursively delete subfolders or delete file
      const itemNormalized = item.replace(/\\/g, '/'); // Ensure forward slashes
      const isProbablyFile = itemNormalized.includes('.');

      if (!isProbablyFile) {
        const subFiles = await listAllRemoteFilesRecursively(ampyPath, port, false, itemNormalized);
        if (Array.isArray(subFiles)) {
          files.push(...subFiles);
        }
      } else {
        files.push(itemNormalized);
      }
    }
  } catch (err: any) {
    // On some boards, ls on a file or non-directory throws error
    console.warn(`[listAllRemoteFilesRecursively] Warning at ${path}: ${err.message}`);
  }

  return files;
}

export async function buildManualIndentedTree(
  filePaths: string[],
  slashFlag?: number,
): Promise<{ label: string; path: string }[]> {

  // Sort alphabetically
  const sorted = filePaths.sort((a, b) => a.localeCompare(b));
  const tree: { label: string; path: string }[] = [];

  const indent = (level: number) => '    '.repeat(level);

  const seenDirs = new Set<string>();

  const slash = `${slashFlag ? '\\' : '/'}`;

  for (const fullPath of sorted) {
    const parts = fullPath.split(slash).filter(Boolean);

    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath = currentPath ? `${currentPath}${slash}${parts[i]}` : parts[i];

      const isLast = i === parts.length - 1;
      const isDir = !isLast;

      if (isDir) {
        const dirPath = `${currentPath}${slash}`;
        if (!seenDirs.has(dirPath)) {
          seenDirs.add(dirPath);
          tree.push({
            label: `${indent(i)}${parts[i]}${slash}    [📁 Folder]`,
            path: dirPath,
          });
        }
      } else {
        tree.push({
          label: `${indent(i)}${parts[i]}    [📄 File]`,
          path: currentPath,
        });
      }
    }
  }

  return tree;
}

export async function generateIndentedTreeItems(
  paths: string[]
): Promise<{ label: string; detail: string }[]> {
  const all = new Set<string>();

  // Collect all folders
  for (const fullPath of paths) {
    const parts = fullPath.split('/').filter(p => p);
    let path = '';
    for (let i = 0; i < parts.length - 1; i++) {
      path += '/' + parts[i];
      all.add(path);
    }
    all.add(fullPath); // Add full file path
  }

  // Sort all paths
  const sorted = Array.from(all).sort((a, b) => a.localeCompare(b));

  // Format with indentation
  return sorted.map(p => {
    const depth = p.split('/').length - 1;
    const name = p.split('/').pop()!;
    return {
      label: `${'  '.repeat(depth)}${name}${p === '/' + name ? '' : '/'}`,
      detail: p
    };
  });
}

function formatIndentedPaths(paths: string[]): string[] {
  return paths
    .sort() // So children follow parents
    .map(path => {
      const depth = path.split('/').length - 1;
      return `${'  '.repeat(depth)}${path}`;
    }
    );
}
