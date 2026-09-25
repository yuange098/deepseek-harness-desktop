/** 找出「哪种合成事件能让 app 真的改宽度」——用来确认用户自己拖宽度这条路没被插件影响。 */
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

const TRY = (strategy, target) => `(() => {
  const target = ${target};
  const handles = [...document.querySelectorAll('[class*="handle"]')]
    .map((el) => ({ el, b: el.getBoundingClientRect() }))
    .filter((h) => h.b.height > 100 && h.b.width <= 16 && h.b.left > window.innerWidth * 0.4)
    .sort((a, b) => b.b.left - a.b.left);
  if (!handles.length) return { err: '没有把手' };
  const h = handles[0];
  const y = h.b.top + h.b.height / 2;
  const startX = h.b.left + h.b.width / 2;
  const endX = window.innerWidth - target;
  let lastX = startX;
  const P = (type, x, buttons) => new PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
    screenX: x, screenY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons,
  });
  const M = (type, x, buttons) => new MouseEvent(type, {
    bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y,
    buttons, view: window, movementX: x - lastX, movementY: 0,
  });
  const steps = 10;
  const moves = (target2) => {
    for (let i = 1; i <= steps; i += 1) {
      const x = startX + ((endX - startX) * i) / steps;
      lastX = x;
      if (${JSON.stringify('A')}) { }
      target2(x);
    }
  };
  const strategy = ${JSON.stringify(strategy)};
  const log = [];
  try {
    if (strategy === 'A') {           // 全发给把手（插件用的方式）
      h.el.dispatchEvent(P('pointerdown', startX, 1));
      h.el.dispatchEvent(M('mousedown', startX, 1));
      moves((x) => { h.el.dispatchEvent(P('pointermove', x, 1)); h.el.dispatchEvent(M('mousemove', x, 1)); });
      h.el.dispatchEvent(P('pointerup', endX, 0));
      h.el.dispatchEvent(M('mouseup', endX, 0));
    } else if (strategy === 'B') {    // 只走鼠标，move 发到 document
      h.el.dispatchEvent(M('mousedown', startX, 1));
      moves((x) => { document.dispatchEvent(M('mousemove', x, 1)); });
      document.dispatchEvent(M('mouseup', endX, 0));
    } else {                          // 只走指针，move 发到 document
      h.el.dispatchEvent(P('pointerdown', startX, 1));
      moves((x) => { document.dispatchEvent(P('pointermove', x, 1)); });
      document.dispatchEvent(P('pointerup', endX, 0));
    }
    log.push('ok');
  } catch (e) { log.push('err=' + e.message); }
  return {
    strategy, startX: Math.round(startX), endX: Math.round(endX), log: log.join(''),
    widthAfter: Math.round(document.querySelector('[class*="rightbarCol"]').getBoundingClientRect().width),
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
  await sleep(12000);
  const results = [];
  for (const [strategy, target] of [['A', 520], ['B', 470], ['C', 440]]) {
    const res = await win.webContents.executeJavaScript(TRY(strategy, target));
    await sleep(2000);
    const width = await win.webContents.executeJavaScript(
      `Math.round(document.querySelector('[class*="rightbarCol"]').getBoundingClientRect().width)`,
    );
    results.push({ ...res, widthNow: width });
    console.log(`${strategy}: 起=${res.startX} 目标位置=${res.endX} → 拖后列宽=${res.widthAfter} 稳定后=${width} (${res.log})`);
  }
  fs.writeFileSync(path.join(WORK, 'userdrag.json'), JSON.stringify(results, null, 1), 'utf8');
  app.exit(0);
});
