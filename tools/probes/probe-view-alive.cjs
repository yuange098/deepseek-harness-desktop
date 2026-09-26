/** 最简检查：点开「代码和文本」页签后，新视图到底渲染了没有。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const HOME = 'E:\\DeepSeekHarness\\home';
const PRELOAD = 'E:\\DeepSeekHarness\\desktop\\src\\preload.js';
const { judgeCodes } = require('E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js');

app.setPath('userData', path.join(WORK, '.electron-scratch-alive'));
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
  ipcMain.handle('dsh:judge-code', (_e, items) => judgeCodes(HOME, items, { maxCalls: 4 }));
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    show: true,
    webPreferences: { preload: PRELOAD, paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(12000);
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const tabs = [...document.querySelectorAll('button,[role="button"],[role="tab"],div,span')]
      .filter((el) => el.textContent.trim() === '代码和文本');
    const target = tabs[tabs.length - 1];
    if (!target) return '没找到页签';
    (target.closest('button,[role=button],[role=tab]') || target).click();
    return '点了：' + target.tagName.toLowerCase();
  })()`);
  console.log('页签: ' + clicked);
  await sleep(7000);
  const state = await win.webContents.executeJavaScript(`(() => ({
    chRoot: document.querySelectorAll('.ch-root').length,
    head: !!document.querySelector('.ch-head'),
    segments: [...document.querySelectorAll('.ch-seg-lg > button')].map((b) => b.textContent.trim()),
    typeBtn: !!document.querySelector('.ch-type .ch-icon-lg'),
    typeLabel: (document.querySelector('.ch-icon-label') || {}).textContent || '',
    empty: (document.querySelector('.ch-empty') || {}).textContent || '',
    tabs: [...document.querySelectorAll('button,[role="tab"]')].map((b) => b.textContent.trim()).filter((t) => t && t.length < 10).slice(0, 10),
  }))()`);
  console.log(JSON.stringify(state, null, 1));
  app.exit(0);
});
