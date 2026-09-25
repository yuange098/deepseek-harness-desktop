/** 只看状态：侧栏宽度、记忆键、卡片尺寸，用来确认"手拖之后没被拉回"。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-hug';
const WAIT = Number(process.argv[3] || 9000);

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
  await new Promise((r) => setTimeout(r, WAIT));
  const info = await win.webContents.executeJavaScript(`(() => {
    const col = document.querySelector('[class*="rightbarCol"]');
    const pane = col && col.querySelector('[class*="_pane_"]');
    const card = col && col.querySelector('button[class*="_entry"]');
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
      return Math.round(b.width) + 'x' + Math.round(b.height) + '@' + Math.round(b.left) + '..' + Math.round(b.right); };
    return {
      col: box(col), pane: box(pane), card: box(card),
      stored: localStorage.getItem('dsh-harness-site:panel-width'),
      hug: localStorage.getItem('dsh-harness-site:panel-hug'),
      cleanup: localStorage.getItem('dsh-harness-site:width-cleanup'),
    };
  })()`);
  console.log(JSON.stringify(info));
  fs.writeFileSync(path.join(WORK, 'state.json'), JSON.stringify(info, null, 1), 'utf8');
  app.exit(0);
});
