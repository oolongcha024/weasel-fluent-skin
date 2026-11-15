import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const HOST = '10.126.179.2';
export const TOOL_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// pnpm runs workspace scripts from the package directory. Explicit CLI paths
// still belong to the directory where the user invoked pnpm.
export function inputPath(path: string) {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
