/** 验收新工具栏：层级（代码/文本 → 执行/回答）、语言筛选（Python 优先）、右侧搜索+展示方式气泡、文本块。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const HOME = 'E:\\DeepSeekHarness\\home';
const PRELOAD = 'E:\\DeepSeekHarness\\desktop\\src\\preload.js';
const { judgeCodes } = require('E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js');
const { deleteSessionData, planSessionDeletion, describeSession } = require('E:\\DeepSeekHarness\\desktop\\src\\session-store.js');

app.setPath('userData', path.join(WORK, '.electron-scratch-toolbar'));
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
  ipcMain.handle('dsh:describe-session', (_e, id) => describeSession(HOME, id));
  ipcMain.handle('dsh:plan-delete-session', (_e, id) => planSessionDeletion(HOME, id));
  ipcMain.handle('dsh:delete-session', (_e, id) => deleteSessionData(HOME, id));

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    useContentSize: true,
    x: 40,
    y: 30,
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
  await sleep(9000);

  const snap = () => win.webContents.executeJavaScript(`(() => {
    const head = document.querySelector('.ch-head');
    const boxes = (sel) => [...(head ? head.querySelectorAll(sel) : [])].map((b) => ({
      text: b.textContent.trim().slice(0, 16),
      on: b.getAttribute('data-on') === '1',
      x: Math.round(b.getBoundingClientRect().left),
      cls: String(b.className || '').slice(0, 24),
    }));
    return {
      segments: boxes('.ch-seg > button'),
      chips: boxes('.ch-chip'),
      pyChip: !!head && !!head.querySelector('.ch-chip-py'),
      searchX: head && head.querySelector('.ch-input') ? Math.round(head.querySelector('.ch-input').getBoundingClientRect().left) : null,
      iconX: head && head.querySelector('.ch-icon') ? Math.round(head.querySelector('.ch-icon').getBoundingClientRect().left) : null,
      pop: !!document.querySelector('.ch-pop'),
      popItems: [...document.querySelectorAll('.ch-pop > button')].map((b) => b.textContent.trim()),
      tiles: document.querySelectorAll('.ch-tile').length,
      texts: document.querySelectorAll('.ch-text').length,
      rightGroup: [...(head ? head.querySelectorAll('.ch-right > *') : [])].map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 16),
        x: Math.round(el.getBoundingClientRect().left),
        w: Math.round(el.getBoundingClientRect().width),
      })),
    };
  })()`);

  const before = await snap();
  console.log('层级（代码/文本 → 执行/回答）: ' + JSON.stringify(before.segments));
  console.log('语言 chip: ' + JSON.stringify(before.chips.filter((c) => /python|全部|其他|javascript|r /.test(c.text))));
  console.log('Python 高亮 chip 存在: ' + before.pyChip + '   搜索框 x=' + before.searchX + '   图标 x=' + before.iconX);
  console.log('右侧组顺序: ' + JSON.stringify(before.rightGroup));
  console.log('气泡（未点开应为 false）: ' + before.pop);

  // 点开展示方式气泡
  await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.ch-icon'); if (b) b.click(); })()`);
  await sleep(800);
  const opened = await snap();
  console.log('点开后气泡: ' + opened.pop + '  选项: ' + JSON.stringify(opened.popItems));

  // 选「平铺」→ 应关气泡并切换
  await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.ch-pop > button')].find((b) => b.textContent.trim() === '平铺');
    if (btn) btn.click();
  })()`);
  await sleep(1200);
  const after = await snap();
  console.log('选平铺后气泡关闭: ' + !after.pop + '   卡片数: ' + after.tiles);

  // 切到文本模块，看是不是块状
  await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.ch-seg > button')].find((b) => b.textContent.trim() === '文本');
    if (btn) btn.click();
  })()`);
  await sleep(1500);
  const textState = await win.webContents.executeJavaScript(`(() => ({
    textBlocks: document.querySelectorAll('.ch-text').length,
    textSegs: [...document.querySelectorAll('.ch-seg-sm > button')].map((b) => b.textContent.trim()),
    empty: !!document.querySelector('.ch-empty'),
    searchPlaceholder: (document.querySelector('.ch-input') || {}).placeholder || '',
  }))()`);
  console.log('文本模块：块数=' + textState.textBlocks + '  子筛选=' + JSON.stringify(textState.textSegs) + '  搜索框=' + textState.searchPlaceholder + '  空态=' + textState.empty);
  app.exit(0);
});
