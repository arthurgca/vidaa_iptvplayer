// Real Chromium regression/profiling without an extra automation dependency.
// BROWSER_PATH can point to Chrome/Edge on other operating systems.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
if (typeof WebSocket === 'undefined') throw new Error('The browser runner requires Node 22+ for its built-in WebSocket client.');
const candidates = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let executable;
for (const candidate of candidates) { try { await access(candidate); executable = candidate; break; } catch {} }
if (!executable) throw new Error('Set BROWSER_PATH to a Chrome or Edge executable.');
const profile = await mkdtemp(path.join(tmpdir(), 'vidaa-ui-test-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } });
let browser, socket;
try {
  await server.listen();
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await wait(100); }
  }
  if (!port) throw new Error('Browser did not expose its debugging port.');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 5000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const address = server.httpServer.address();
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  const [width, height] = (process.env.UI_VIEWPORT || '1920x1080').split('x').map(Number);
  if (!width || !height) throw new Error('UI_VIEWPORT must be WIDTHxHEIGHT.');
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `http://127.0.0.1:${address.port}/tests/fixtures/${process.env.UI_FIXTURE || 'ui-stability.html'}` });
  let report;
  for (let attempt = 0; attempt < 300; attempt++) {
    const result = await command('Runtime.evaluate', { expression: 'window.uiStability', returnByValue: true });
    report = result.result?.value;
    if (report?.done) break;
    await wait(100);
  }
  if (!report?.done) throw new Error('Browser regression timed out.');
  if (report.error) throw new Error(report.error);
  if (process.env.UI_SCREENSHOT) {
    const screenshot = await command('Page.captureScreenshot', { format: 'png' });
    await writeFile(process.env.UI_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  }
  console.log(JSON.stringify(report.reports, null, 2));
  console.log('Chromium UI stability checks passed. Native VIDAA keyboard still requires hardware validation.');
  await command('Browser.close');
} finally {
  socket?.close();
  browser?.kill();
  await server.close();
  // Only remove the exact temporary profile created above.
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith('vidaa-ui-test-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
