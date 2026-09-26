/**
 * 验收「导入仓库」新逻辑：
 *  1. 聊天里的代码框有没有导入图标（.dsh-ch-import）
 *  2. 点一个 → 是否进仓库、有没有 AI 起的名字
 *  3. 模块里是否只显示导入的（且没有 执行/回答、含片段、AI 判断 这些按钮）
 *  4. 类型气泡里是否有「代码类型」「文本类型」两组
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const HOME = 'E:\\DeepSeekHarness\\home';
const PRELOAD = 'E:\\DeepSeekHarness\\desktop\\src\\preload.js';
const { judgeCodes } = require('E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js');
const { deleteSessionData, planSessionDeletion, describeSession } = require('E:\\DeepSeekHarness\\desktop\\src\\session-store.js');

app.setPath('userData', path.join(WORK, '.electron-scratch-import'));
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

  // 打开一个会话（越新的越可能有代码块）
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
  await sleep(9000);

  const buttons = await win.webContents.executeJavaScript(`(() => ({
    pres: document.querySelectorAll('pre').length,
    imports: document.querySelectorAll('.dsh-ch-import').length,
    inChat: [...document.querySelectorAll('.dsh-ch-import')].filter((b) => !b.closest('.ch-root')).length,
  }))()`);
  console.log('聊天代码框: ' + JSON.stringify(buttons));

  if (buttons.inChat > 0) {
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('.dsh-ch-import')].find((x) => !x.closest('.ch-root'));
      if (b) b.click();
    })()`);
    await sleep(9000);
    const lib = await win.webContents.executeJavaScript(`(() => {
      const all = JSON.parse(localStorage.getItem('dsh-code-history:library') || '{}');
      const session = JSON.parse(localStorage.getItem('dsh.sessions.current') || '{}');
      const key = session.sessionId || Object.keys(all)[0];
      const bucket = all[key] || { code: [], text: [] };
      return {
        sessions: Object.keys(all).length,
        code: bucket.code.length,
        titles: bucket.code.map((i) => i.title + ' / ' + i.name + ' / ' + i.lang),
        done: document.querySelectorAll('.dsh-ch-import[data-done="1"]').length,
        toast: (document.querySelector('.dsh-ch-toast') || {}).textContent || '',
      };
    })()`);
    console.log('导入结果: ' + JSON.stringify(lib, null, 1));
  } else {
    console.log('这个会话没有可导入的代码框（先切一个有代码的会话）');
  }

  // 打开模块，看 Toolbar
  await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('button,[role="button"],[role="tab"],div')]
      .reverse()
      .find((n) => n.children.length === 0 && n.textContent.trim().startsWith('代码') && n.offsetParent);
    if (el) (el.closest('button,[role=button],[role=tab]') || el).click();
  })()`);
  await sleep(5000);
  const view = await win.webContents.executeJavaScript(`(() => {
    const head = document.querySelector('.ch-head');
    return {
      segments: [...document.querySelectorAll('.ch-seg-lg > button')].map((b) => b.textContent.trim()),
      hasTypeBtn: !!document.querySelector('.ch-type .ch-icon-lg'),
      oldButtons: ['执行', '回答', '含片段', 'AI 判断'].filter((t) =>
        [...document.querySelectorAll('.ch-chip, .ch-seg-sm > button')].some((b) => b.textContent.trim().startsWith(t))),
      tiles: document.querySelectorAll('.ch-tile').length,
      texts: document.querySelectorAll('.ch-text').length,
      candidates: document.querySelectorAll('.ch-cand').length,
      emptyText: (document.querySelector('.ch-empty') || {}).textContent || '',
      typeLabel: (document.querySelector('.ch-icon-label') || {}).textContent || '',
      viewIcon: !!document.querySelector('.ch-view .ch-icon'),
      searchX: head && head.querySelector('.ch-input') ? Math.round(head.querySelector('.ch-input').getBoundingClientRect().left) : null,
      iconX: head && head.querySelector('.ch-view .ch-icon') ? Math.round(head.querySelector('.ch-view .ch-icon').getBoundingClientRect().left) : null,
    };
  })()`);
  console.log('模块: ' + JSON.stringify(view, null, 1));

  // 类型气泡
  await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.ch-type .ch-icon-lg'); if (b) b.click(); })()`);
  await sleep(900);
  const pop = await win.webContents.executeJavaScript(`(() => ({
    open: !!document.querySelector('.ch-pop-wide'),
    groups: [...document.querySelectorAll('.ch-pop-wide .ch-pop-title')].map((n) => n.textContent.trim()),
    codeItems: [...document.querySelectorAll('.ch-pop-wide .ch-pop-group')].map((g) => [...g.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 4)),
  }))()`);
  console.log('类型气泡: ' + JSON.stringify(pop));
  app.exit(0);
});
