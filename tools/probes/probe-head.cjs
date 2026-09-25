/** 打印代码页签工具栏的真实 DOM 顺序与坐标，确认"搜索框在左、展示方式图标最右"。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const HOME = 'E:\\DeepSeekHarness\\home';
const PRELOAD = 'E:\\DeepSeekHarness\\desktop\\src\\preload.js';
const { judgeCodes } = require('E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js');

app.setPath('userData', path.join(WORK, '.electron-scratch-head'));
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
  ipcMain.handle('dsh:judge-code', (_e, items) => judgeCodes(HOME, items, { maxCalls: 8 }));
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    show: true,
    webPreferences: { preload: PRELOAD, paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(11000);
  await win.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('button,[role="button"],a,div')]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return el.offsetParent && b.left < 300 && b.width > 140 && b.height > 20 && b.height < 70
          && /(\\d+)\\s*(小时|分钟)/.test(el.textContent);
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (rows[0]) rows[0].click();
  })()`);
  await sleep(6000);
  await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('button,[role="button"],[role="tab"],div')]
      .reverse()
      .find((n) => n.children.length === 0 && n.textContent.trim().startsWith('代码') && n.offsetParent);
    if (el) (el.closest('button,[role=button],[role=tab]') || el).click();
  })()`);
  await sleep(8000);
  const out = await win.webContents.executeJavaScript(`(() => {
    const head = document.querySelector('.ch-head');
    if (!head) return { error: 'no head' };
    const rect = (el) => { const b = el.getBoundingClientRect(); return Math.round(b.left) + '..' + Math.round(b.right); };
    const walk = (el, depth) => {
      const lines = [];
      for (const child of el.children) {
        const cls = String(child.className || '');
        const tag = child.tagName.toLowerCase();
        const text = child.children.length === 0 ? child.textContent.trim().slice(0, 12) : '';
        lines.push('  '.repeat(depth) + `<${tag}.${cls.slice(0, 22)}> ${rect(child)} ${text}`);
        if (depth < 2) lines.push(...walk(child, depth + 1));
      }
      return lines;
    };
    return { head: rect(head), rows: walk(head, 0) };
  })()`);
  console.log('工具栏范围: ' + out.head);
  for (const line of out.rows || []) console.log(line);
  app.exit(0);
});
