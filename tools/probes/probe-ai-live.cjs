/** 验证 AI 判定在真实界面里生效：卡片标题变成 AI 功能名、片段被折叠、缓存写入。 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const HOME = 'E:\\DeepSeekHarness\\home';
const PRELOAD = 'E:\\DeepSeekHarness\\desktop\\src\\preload.js';
const { judgeCodes } = require('E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js');
const { deleteSessionData, planSessionDeletion, describeSession } = require('E:\\DeepSeekHarness\\desktop\\src\\session-store.js');

app.setPath('userData', path.join(WORK, '.electron-scratch-ai'));
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

  for (const wait of [8000, 10000, 10000]) {
    await sleep(wait);
    const state = await win.webContents.executeJavaScript(`(() => ({
      chips: [...document.querySelectorAll('.ch-chip')].map((b) => b.textContent.trim()),
      titles: [...document.querySelectorAll('.ch-tile-title > span')].map((s) => s.textContent.trim()).slice(0, 6),
      aiTags: [...document.querySelectorAll('.ch-tile-title .ch-tag')].map((s) => s.textContent.trim()),
      tiles: document.querySelectorAll('.ch-tile').length,
    }))()`);
    console.log(`[${wait / 1000}s] tiles=${state.tiles} chips=${JSON.stringify(state.chips)}`);
    console.log('        标题: ' + JSON.stringify(state.titles));
    if (state.aiTags.length) console.log('        AI 标记: ' + JSON.stringify(state.aiTags));
  }

  const cacheFile = path.join(HOME, 'cache', 'code-history', 'judge.json');
  if (fs.existsSync(cacheFile)) {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const items = Object.values(cache.items || {});
    console.log(`缓存条数: ${items.length}（其中判定"不可用"${items.filter((v) => !v.usable).length} 条）`);
    for (const v of items.slice(0, 6)) console.log(`   ${v.usable ? '可用' : '片段'} · ${v.feature} · ${v.reason}`);
  } else {
    console.log('缓存文件还没生成');
  }
  app.exit(0);
});
