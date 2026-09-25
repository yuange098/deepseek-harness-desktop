/** 加载真实界面并截取右栏区域，用于肉眼确认改小后的观感。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';
const OUT = process.argv[2] || path.join(WORK, 'pane-compact.png');
const PROFILE = process.argv[3] || '.electron-scratch';

app.setPath('userData', path.join(WORK, PROFILE));
app.disableHardwareAcceleration();

function currentUrl() {
  const files = fs
    .readdirSync(LOGS)
    .filter((f) => f.startsWith('dsh-web-') && f.endsWith('.log'))
    .map((f) => ({ f, t: fs.statSync(path.join(LOGS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const m = fs.readFileSync(path.join(LOGS, f), 'utf8').match(/dsh web:\s+(http\S+)/);
    if (m) return m[1];
  }
  throw new Error('no url');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    x: 40,
    y: 30,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await new Promise((r) => setTimeout(r, 9000));
  if (process.argv[4] === 'full') {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(OUT, image.toPNG());
    console.log('写出（整窗）：' + OUT);
    app.exit(0);
    return;
  }
  const rect = await win.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('[class*="_paneBody"]');
    if (!pane) return null;
    const r = pane.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(r.left) - 8), y: Math.max(0, Math.floor(r.top) - 8),
             w: Math.ceil(r.width) + 16, h: Math.ceil(r.height) + 16 };
  })()`);
  const image = await win.webContents.capturePage(
    rect ? { x: rect.x, y: rect.y, width: rect.w, height: rect.h } : undefined,
  );
  fs.writeFileSync(OUT, image.toPNG());
  console.log('写出：' + OUT);
  app.exit(0);
});
