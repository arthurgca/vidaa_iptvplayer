import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `package.json` is the single source of truth for the version, and it sits one level
 * above both `server/` in the repository and `build-server/` in the container image,
 * so the same relative path resolves for `tsx` and for the compiled build.
 */
const packagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

export const APP_VERSION: string = (() => {
  try {
    const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    // A running TV should still get an answer from /health, so a missing manifest is not fatal.
    return '0.0.0';
  }
})();
