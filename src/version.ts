/**
 * Replaced at build time with the `package.json` version, so a bundle can name itself.
 * A TV that is serving a stale cached bundle reports the version it was built from,
 * which is what makes a frontend/backend mismatch visible in Settings.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
