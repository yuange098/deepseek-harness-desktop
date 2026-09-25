/** 清掉全局宽度/收窄标记后重载，验证「插件自己把侧栏拖到刚好放得下按钮」这条路。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, "..", "..", ".probe-work");
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-hug';

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

const REPORT = `(() => {
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const pane = document.querySelector('[class*="rightbarCol"] [class*="_pane_"]');
  const col = document.querySelector('[class*="rightbarCol"]');
  const card = document.querySelector('[class*="rightbarCol"] button[class*="_entry"]');
  return {
    win: window.innerWidth + 'x' + window.innerHeight,
    pane: box(pane), col: box(col),
    panel: box(document.querySelector('[class*="P3OORG_panel"]')),
    body: box(document.querySelector('[class*="P3OORG_panelBody"]')),
    center: box(document.querySelector('[class*="centerCol"]')),
    guide: box(document.querySelector('[class*="rightbarCol"] [class*="_guide"]')),
    card: box(card),
    cardPad: card ? getComputedStyle(card).padding : '',
    handles: [...document.querySelectorAll('[class*="handle"]')].map((el) => Math.round(el.getBoundingClientRect().left)),
    keys: ['dsh-harness-site:panel-width', 'dsh-harness-site:panel-hug-base', 'dsh-harness-site:panel-hug', 'dsh-harness-site:width-cleanup']
      .map((k) => k + '=' + localStorage.getItem(k)),
  };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await sleep(9000);
  const before = await win.webContents.executeJavaScript(REPORT);
  await win.webContents.executeJavaScript(`(() => {
    ['dsh-harness-site:panel-width', 'dsh-harness-site:panel-hug-base', 'dsh-harness-site:panel-hug', 'dsh-harness-site:width-cleanup']
      .forEach((k) => localStorage.removeItem(k));
    return 'cleared';
  })()`);
  await win.webContents.reload();
  await sleep(14000);
  const after = await win.webContents.executeJavaScript(REPORT);

  // 第 3 步：模拟"用户自己把侧栏拖宽到 520"，验证插件不抢方向盘 + 宽度被记住
  if (process.argv[3] === 'hugonly') {
    const r = after;
    const fmt2 = (b) => (b ? b.w + 'x' + b.h + '@' + b.left + '..' + b.right : 'null');
    console.log(`[收窄后] 列=${fmt2(r.col)} 面板=${fmt2(r.panel)} 内容层=${fmt2(r.body)} 面板区=${fmt2(r.pane)} 卡片=${fmt2(r.card)} 列表=${fmt2(r.guide)} 聊天区=${fmt2(r.center)} 把手=${r.handles.join(',')}`);
    console.log('键: ' + after.keys.join(' | '));
    app.exit(0);
    return;
  }
  const userDrag = await win.webContents.executeJavaScript(`(() => {
    const target = 520;
    const handles = [...document.querySelectorAll('[class*="handle"]')]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter((h) => h.b.height > 100 && h.b.width <= 16 && h.b.left > window.innerWidth * 0.4)
      .sort((a, b) => b.b.left - a.b.left);
    if (!handles.length) return '没有把手';
    const h = handles[0];
    const y = h.b.top + h.b.height / 2;
    const startX = h.b.left + h.b.width / 2;
    const endX = window.innerWidth - target;
    let lastX = startX;
    const pointer = (type, x, buttons) => new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
      screenX: x, screenY: y, pointerId: 2, pointerType: 'mouse', isPrimary: true, buttons,
    });
    const mouse = (type, x, buttons) => new MouseEvent(type, {
      bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
      buttons, view: window, movementX: x - lastX, movementY: 0,
    });
    h.el.dispatchEvent(pointer('pointerdown', startX, 1));
    h.el.dispatchEvent(mouse('mousedown', startX, 1));
    for (let i = 1; i <= 10; i += 1) {
      const x = startX + ((endX - startX) * i) / 10;
      lastX = x;
      h.el.dispatchEvent(pointer('pointermove', x, 1));
      h.el.dispatchEvent(mouse('mousemove', x, 1));
    }
    h.el.dispatchEvent(pointer('pointerup', endX, 0));
    h.el.dispatchEvent(mouse('mouseup', endX, 0));
    return '拖到目标宽度 ' + target;
  })()`);
  await sleep(3000);
  const afterUserDrag = await win.webContents.executeJavaScript(REPORT);
  fs.writeFileSync(
    path.join(WORK, 'rehug.json'),
    JSON.stringify({ before, after, userDrag, afterUserDrag }, null, 1),
    'utf8',
  );
  const fmt = (b) => (b ? b.w + 'x' + b.h + '@' + b.left + '..' + b.right : 'null');
  for (const [name, r] of [['重载前', before], ['重载后', after]]) {
    console.log(`[${name}] 列=${fmt(r.col)} 面板=${fmt(r.panel)} 内容层=${fmt(r.body)} 面板区=${fmt(r.pane)} 卡片=${fmt(r.card)} 列表=${fmt(r.guide)} 聊天区=${fmt(r.center)} 把手=${r.handles.join(',')} 卡片内边距=${r.cardPad}`);
  }
  const u = afterUserDrag;
  console.log(`[用户自己拖宽] ${userDrag} → 列=${fmt(u.col)} 面板区=${fmt(u.pane)} 聊天区=${fmt(u.center)} 把手=${u.handles.join(',')}`);
  console.log('键: ' + after.keys.join(' | '));
  console.log('拖宽后键: ' + u.keys.join(' | '));
  app.exit(0);
});
