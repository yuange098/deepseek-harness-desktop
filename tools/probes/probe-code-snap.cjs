/**
 * 取证：代码页插件手里到底有哪些数据，能不能拿到"每个任务对应的用户提问原文"。
 * 读插件挂在 window.__CH_SNAP__ 上的快照（traj / chat / extracted）。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-snap';
const SESSION = Number(process.argv[3] || 0); // 打开第几个会话（0 = 第一个）

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

const SCAN = `(() => {
  const snap = window.__CH_SNAP__;
  if (!snap) return { error: '插件还没挂快照（先切到「代码」页签）' };
  const out = { traj: null, chat: null, conv: null, tasks: null };

  // 1) 轨迹事件：块类型分布 + 有没有用户消息
  const traj = snap.traj;
  if (traj && Array.isArray(traj.eventNodes)) {
    const kinds = {};
    const samples = [];
    for (const node of traj.eventNodes) {
      const blocks = Array.isArray(node.blocks) ? node.blocks : [node];
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const k = String(b.kind || b.type || '?');
        kinds[k] = (kinds[k] || 0) + 1;
        if (samples.length < 12 && /user|prompt|message|text/i.test(k)) {
          samples.push({ kind: k, turn: node.turn, keys: Object.keys(b).slice(0, 10), text: String(b.text || '').slice(0, 60) });
        }
      }
    }
    out.traj = { nodes: traj.eventNodes.length, kinds, samples };
  }

  // 2) chat 快照：节点长什么样（nodes 是 Map，要按 Map 走）
  const chat = snap.chat;
  if (chat) {
    const entries = [];
    const take = (key, value) => {
      if (!value || typeof value !== 'object') return;
      const kind = String(value.kind || value.type || value.role || '?');
      let text = '';
      for (const k of ['text', 'content', 'title', 'body', 'message', 'value']) {
        if (typeof value[k] === 'string') { text = value[k]; break; }
      }
      entries.push({ id: String(key).slice(0, 24), kind, keys: Object.keys(value).slice(0, 12), text: text.slice(0, 70) });
    };
    if (chat.nodes instanceof Map) for (const [k, v] of chat.nodes) take(k, v);
    else if (chat.nodes && typeof chat.nodes === 'object') for (const [k, v] of Object.entries(chat.nodes)) take(k, v);
    out.chat = { order: Array.isArray(chat.order) ? chat.order.length : 0, count: entries.length, entries: entries.slice(0, 14) };
  }

  // 3) extracted：任务里有没有带上"触发它的用户提问"
  const ex = snap.extracted;
  if (ex) {
    const tasks = (ex.tasks || []).slice(0, 6).map((t) => ({
      turn: t.turn,
      keys: Object.keys(t).slice(0, 14),
      modules: (t.modules || []).length,
      prompt: String(t.prompt || t.userText || t.request || '').slice(0, 80),
    }));
    out.tasks = { count: (ex.tasks || []).length, total: ex.total, tasks };
  }
  return out;
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
  await sleep(11000);

  const rows = await win.webContents.executeJavaScript(`(() => {
    const list = [...document.querySelectorAll('button,[role="button"],a,div')]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return el.offsetParent && b.left < 300 && b.width > 140 && b.height > 20 && b.height < 70
          && /(\\d+)\\s*(小时|分钟)/.test(el.textContent);
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (list[${SESSION}]) list[${SESSION}].click();
    return list.length;
  })()`);
  console.log('可点会话行: ' + rows);
  await sleep(7000);
  const tab = await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('button,[role="button"],[role="tab"],div')]
      .reverse()
      .find((n) => n.children.length === 0 && n.textContent.trim() === '代码' && n.offsetParent);
    if (!el) return '没找到代码页签';
    (el.closest('button,[role=button],[role=tab]') || el).click();
    return '已切到代码页签';
  })()`);
  console.log('页签: ' + tab);
  await sleep(6000);

  const diag = await win.webContents.executeJavaScript(`(() => ({
    chRoot: document.querySelectorAll('.ch-root').length,
    chTiles: document.querySelectorAll('.ch-tile').length,
    hasSnap: !!window.__CH_SNAP__,
    tabLabels: [...document.querySelectorAll('button,[role="tab"]')].map((b) => (b.textContent || '').trim()).filter((t) => t && t.length < 8).slice(0, 12),
  }))()`);
  console.log('挂载诊断: ' + JSON.stringify(diag));

  const info = await win.webContents.executeJavaScript(SCAN);
  fs.writeFileSync(path.join(WORK, 'code-snap.json'), JSON.stringify(info, null, 1), 'utf8');
  console.log(JSON.stringify(info, null, 1).slice(0, 5000));
  app.exit(0);
});
