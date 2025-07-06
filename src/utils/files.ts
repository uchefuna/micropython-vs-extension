

import * as fs from 'fs';
import * as path from 'path';

export interface FileItem {
  label: string;
  description?: string;
  detail?: string;
  relativePath: string;      // path relative to workspace
  absolutePath: string;      // full path on disk (required for upload)
  type: 'file' | 'folder';
}


export function getAllFiles(root: string, exclusions: string[] = []): FileItem[] {
  const items: FileItem[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (exclusions.some(ex => fullPath.includes(ex))) continue;

      items.push({
        label: entry.name,
        relativePath,
        absolutePath: fullPath,
        type: entry.isDirectory() ? 'folder' : 'file',
        description: entry.isDirectory() ? '📁 Folder' : '📄 File',
        detail: fullPath,
      });

      if (entry.isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(root);
  return items;
}


//  * Get all immediate children (files and folders) of the given directory, filtered by exclusions.
// export function getAllFiles_old(
//   dir: string,
//   exclusions: string[] = []
// ): FileItem[] {
//   const entries = fs.readdirSync(dir, { withFileTypes: true });
//   const items: FileItem[] = [];

//   for (const entry of entries) {
//     // Check exclusion patterns (basic glob-like)
//     const isExcluded = exclusions.some(ex => {
//       if (ex.endsWith('/')) {
//         return entry.isDirectory() && entry.name.startsWith(ex.slice(0, -1));
//       } else {
//         return entry.name.includes(ex);
//       }
//     });
//     if (isExcluded) continue;

//     const itemType = entry.isDirectory() ? 'folder' : 'file';
//     const relativePath = entry.name; // Immediate child: just name

//     items.push({
//       label: entry.name,
//       relativePath,
//       type: itemType
//     });
//   }

//   return items;
// }

// export function getAllFiles_another_old(dir: string, exclusions: string[], baseDir: string = dir): FileItem[] {
//   let results: FileItem[] = [];

//   const entries = fs.readdirSync(dir, { withFileTypes: true });
//   for (const entry of entries) {
//     const fullPath = path.join(dir, entry.name);
//     const relative = path.relative(baseDir, fullPath);

//     // Skip excluded files/folders
//     if (exclusions.some(ex => relative.startsWith(ex) || relative.includes(ex))) {
//       continue;
//     }

//     if (entry.isDirectory()) {
//       results.push({
//         label: entry.name,
//         relativePath: relative,
//         type: 'folder',
//       });

//       // Recurse into folder
//       results = results.concat(getAllFiles(fullPath, exclusions, baseDir));
//     } else if (entry.isFile()) {
//       results.push({
//         label: entry.name,
//         relativePath: relative,
//         type: 'file',
//       });
//     }
//   }

//   return results;
// }
