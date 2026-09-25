/** 读出右侧栏里实际渲染的卡片文字（不靠截图）。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';

app.setPath('userData', path.join(WORK, '.electron-scratch'));
app.disableHardwareAcceleration();

function currentUrl() {
  const files = fs
    .readdirSync(LOGS)
    .filter((f) => f.startsWith('dsh-web-') && f.endsWith('.log'))
    .map((f) => ({ f, t: fs.statSync(path.join(LOGS, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files) {
    const m = fs.readFileSync(path.join(LOGS, f), 'utf8').match(/dsh web:\s+(\S+)/);
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
  const info = await win.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('[class*="_paneBody"], [class*="paneBody"]');
    if (!pane) return { error: '未找到右栏' };
    const cards = [...pane.querySelectorAll("button,a")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 40 && r.width > 150;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent.trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display };
    });
    // 也看看有没有被 display:none 藏起来的
    const hidden = [...pane.querySelectorAll("button,a")].filter((el) => getComputedStyle(el).display === "none").map((el) => el.textContent.trim().slice(0, 14));
    return { paneWidth: Math.round(pane.getBoundingClientRect().width), cards, hidden };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  app.exit(0);
});
