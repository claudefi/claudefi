/**
 * Runtime Detection
 *
 * Detects whether we're running in Bun or Node.js environment.
 * Both runtimes are equally supported.
 */

// @ts-ignore - Bun global exists in Bun runtime
export const isBun = typeof Bun !== 'undefined';
export const isNode = !isBun;

export const runtime = isBun ? 'bun' : 'node';

export const runtimeInfo = {
  runtime,
  isBun,
  isNode,
  version: isBun
    // @ts-ignore - Bun global
    ? `bun ${Bun.version}`
    : `node ${process.version}`,
};

/**
 * Get the package runner command for the current runtime
 */
export function getPackageRunner(): string {
  return isBun ? 'bunx' : 'npx';
}

/**
 * Get the package manager command for the current runtime
 */
export function getPackageManager(): string {
  return isBun ? 'bun' : 'npm';
}

/**
 * Get the script runner for TypeScript files
 */
export function getScriptRunner(): string {
  return isBun ? 'bun' : 'npx tsx';
}
