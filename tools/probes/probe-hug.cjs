/** 量「容器是不是刚好包住按钮」：面板宽度、卡片宽度、左右余量、内边距，外加面板头部按钮与相关存储键。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';

app.setPath('userData', path.join(WORK, '.electron-scratch-hug'));
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

const PROBE = `(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      cls: (el.className || '').toString().slice(0, 40),
      left: Math.round(b.left), right: Math.round(b.right),
      w: Math.round(b.width), h: Math.round(b.height),
      padL: cs.paddingLeft, padR: cs.paddingRight,
      minW: cs.minWidth, cssW: cs.width, flexBasis: cs.flexBasis,
      inlineW: el.style ? el.style.width : '',
    };
  };
  const pad = (el) => {
    if (!el) return 0;
    const cs = getComputedStyle(el);
    return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  };
  const pane = document.querySelector('[class*="_pane_"]');
  if (!pane) return { error: '未找到面板' };
  const paneBox = r(pane);
  const body = pane.querySelector('[class*="_paneBody"]');
  const guide = pane.querySelector('[class*="_guide"]');
  const cell = pane.querySelector('[class*="_entryCell"]');
  const card = pane.querySelector('button[class*="_entry"]');
  const win = window.innerWidth;
  const headerBtns = [...pane.querySelectorAll('button,[role="button"]')]
    .filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.width < 60 && b.height < 60;
    })
    .slice(0, 8)
    .map((el) => ({
      title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
      txt: el.textContent.trim().slice(0, 8),
      left: Math.round(el.getBoundingClientRect().left),
      top: Math.round(el.getBoundingClientRect().top),
    }));
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && (k.indexOf('dsh') === 0 || k.indexOf('sidebar') === 0)) {
        keys.push(k + ' = ' + String(localStorage.getItem(k)).slice(0, 140));
      }
    }
  } catch (e) { keys.push('读取失败: ' + e.message); }
  return {
    win,
    pane: paneBox,
    paneRightGap: win - paneBox.right,
    paneMinW: getComputedStyle(pane).minWidth,
    body: r(body),
    guide: r(guide),
    cell: r(cell),
    card: r(card),
    cardSlackLeft: card ? Math.round(card.getBoundingClientRect().left - paneBox.left) : null,
    cardSlackRight: card ? Math.round(paneBox.right - card.getBoundingClientRect().right) : null,
    hugNeeded: card ? Math.round(card.getBoundingClientRect().width + pad(body) + pad(guide) + 2) : null,
    headerBtns,
    rightNeighbor: (() => {
      const el = document.elementFromPoint(win - 30, Math.round(window.innerHeight / 2));
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        left: Math.round(b.left), w: Math.round(b.width),
        txt: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 30),
      };
    })(),
    keys,
    stored: localStorage.getItem('dsh-harness-site:panel-width'),
    hugFlag: localStorage.getItem('dsh-harness-site:panel-hug'),
  };
})()`;

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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(11000);
  // 侧栏可能是收起状态：先展开，让 7 个按钮渲染出来
  const titles = await win.webContents.executeJavaScript(`(() => {
    return [...document.querySelectorAll('button,[role="button"]')].map((el) => ({
      title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
      txt: el.textContent.trim().slice(0, 10),
      left: Math.round(el.getBoundingClientRect().left),
      top: Math.round(el.getBoundingClientRect().top),
    })).filter((b) => b.title || b.txt);
  })()`);
  const openers = titles.filter((b) => b.title.indexOf('侧边栏') >= 0 || b.txt.indexOf('侧边栏') >= 0);
  const hasCards = await win.webContents.executeJavaScript(
    `!!document.querySelector('[class*="_entryCell"]')`,
  );
  let action = '无需展开';
  if (!hasCards) {
    const opener = openers.find((b) => b.title.indexOf('收起') < 0);
    const target = opener || openers[0];
    if (target) {
      await win.webContents.executeJavaScript(`(() => {
        const el = [...document.querySelectorAll('button,[role="button"]')]
          .find((b) => (b.getAttribute('title') || b.getAttribute('aria-label') || '') === ${JSON.stringify(target.title)});
        if (el) el.click();
        return !!el;
      })()`);
      action = '已点：' + (target.title || target.txt);
      await sleep(4500);
    } else {
      action = '没找到展开按钮';
    }
  }
  let info;
  try {
    info = await win.webContents.executeJavaScript(PROBE);
  } catch (e) {
    info = { error: String((e && e.message) || e) };
  }
  info.sidebarButtons = openers;
  info.action = action;
  fs.writeFileSync(path.join(WORK, 'pane-hug.json'), JSON.stringify(info, null, 1), 'utf8');
  console.log(JSON.stringify(info, null, 1));
  app.exit(0);
});
