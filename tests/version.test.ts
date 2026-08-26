import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION as SERVER_VERSION } from '../server/version';
import { APP_VERSION as CLIENT_VERSION } from '../src/version';

const manifestVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

describe('versioning', () => {
  it('keeps one version across the manifest, the server and the bundle', () => {
    expect(manifestVersion).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
    expect(SERVER_VERSION).toBe(manifestVersion);
    // Injected by the `define` in vite.config.ts, which vitest loads as well.
    expect(CLIENT_VERSION).toBe(manifestVersion);
  });

  it('has a changelog section for the version being shipped', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    expect(changelog).toContain(`## [${manifestVersion}]`);
  });
});
