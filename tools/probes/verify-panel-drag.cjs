/** 模拟"用户拖动面板到 470px"，验证 ResizeObserver 兜底路径能记住宽度。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';
const WIDTH_KEY = 'dsh-harness-site:panel-width';
// 想先点开哪个会话：运行时用第一个参数指定（例：node verify-panel-drag.cjs "示例会话"）
const SESSION_NAME = process.argv[2] || '新会话';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    useContentSize: true,
    x: 60,
    y: 40,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(9000);
  await win.webContents.executeJavaScript(`(() => {
    localStorage.removeItem(${JSON.stringify(WIDTH_KEY)});
    const hit = [...document.querySelectorAll('*')].reverse()
      .find((el) => el.children.length === 0
        && el.textContent.trim() === ${JSON.stringify(SESSION_NAME)} && el.offsetParent);
    if (hit) (hit.closest('button,[role=button],li,a') || hit).click();
  })()`);
  await sleep(7000);

  // 模拟拖动结果：直接改面板容器宽度
  const before = await win.webContents.executeJavaScript(
    `localStorage.getItem(${JSON.stringify(WIDTH_KEY)})`,
  );
  await win.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('[class*="_pane_"]');
    let host = pane;
    for (let i = 0; i < 4 && host && host !== document.body; i += 1) {
      if (host.style && host.style.width) break;
      host = host.parentElement;
    }
    if (host) { host.style.width = '470px'; host.style.maxWidth = 'none'; }
  })()`);
  await sleep(2500);
  const after = await win.webContents.executeJavaScript(
    `localStorage.getItem(${JSON.stringify(WIDTH_KEY)})`,
  );
  const width = await win.webContents.executeJavaScript(
    `Math.round(document.querySelector('[class*="_pane_"]').getBoundingClientRect().width)`,
  );
  console.log(`拖拽前全局键=${before}  拖到 470px 后全局键=${after}  当前实际宽度=${width}`);
  app.exit(0);
});
