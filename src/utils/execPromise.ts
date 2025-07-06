

import { exec } from 'child_process';


// Promisified exec function
// export function execPromise(command: string): Promise<string> {
//   return new Promise((resolve, reject) => {
//     exec(command, (error, stdout, stderr) => {
//       if (error) {
//         reject(new Error(stderr || error.message));
//       } else {
//         resolve(stdout.trim());
//       }
//     });
//   });
// }


// execPromise helper
export async function execPromise(command: string): Promise<string> {
  const exec = require('child_process').exec;
  return new Promise((resolve, reject) => {
    exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
} 
