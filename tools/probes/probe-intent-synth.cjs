/**
 * 合成数据测试：造两段轨迹喂给插件的 extract()，验证
 *   ① 文字任务（写引言）被标成 intent=text，且它写的脚本归属该 turn
 *   ② 代码任务（画气泡图）标成 intent=code
 *   ③ 回答页签里的代码也能带上 turn（用于同样折叠）
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-synth';

app.setPath('userData', path.join(WORK, PROFILE));
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

const SCRIPT = `import re, sys

def polish(text: str) -> str:
    text = re.sub(r"\\s+", " ", text)
    return text.strip()

if __name__ == "__main__":
    print(polish(open(sys.argv[1], encoding="utf-8").read()))
`;

const PLOT = `import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("points.csv")
plt.scatter(df.x, df.y, s=df.size)
plt.savefig("bubble.png", dpi=200)
`;

const TRAJ = {
  eventNodes: [
    { turn: 0, time: 1, blocks: [{ kind: 'user', content: '帮我根据这份材料写一篇 800 字的引言' }] },
    {
      turn: 1,
      time: 2,
      blocks: [
        { kind: 'tool-call', text: JSON.stringify({ file_path: 'C:\\\\tmp\\\\polish.py', content: SCRIPT }) },
        { kind: 'tool-result', text: 'ok' },
        { kind: 'text', text: '引言写好了：\n\n```python\n' + SCRIPT + '\n```\n（上面是我顺手用来排版的脚本）' },
      ],
    },
    { turn: 1, time: 3, blocks: [{ kind: 'user', content: '用 python 帮我画一张气泡图，数据在 points.csv' }] },
    {
      turn: 2,
      time: 4,
      blocks: [
        { kind: 'tool-call', text: JSON.stringify({ file_path: 'C:\\\\tmp\\\\bubble.py', content: PLOT }) },
        { kind: 'tool-result', text: '已生成 bubble.png' },
        { kind: 'text', text: '画好了，代码如下：\n\n```python\n' + PLOT + '\n```' },
      ],
    },
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    useContentSize: true,
    show: true,
    webPreferences: { paintWhenInitiallyHidden: true, backgroundThrottling: false },
  });
  await win.loadURL(currentUrl());
  await sleep(11000);
  const hook = await win.webContents.executeJavaScript(`typeof window.__CH_INTENT__`);
  if (hook !== 'object') {
    console.log('插件钩子没挂上，中止');
    app.exit(1);
    return;
  }
  const result = await win.webContents.executeJavaScript(`(() => {
    const out = window.__CH_INTENT__.extract(${JSON.stringify(TRAJ)}, []);
    return {
      tasks: out.tasks.map((t) => ({ turn: t.turn, intent: t.intent, prompt: String(t.prompt).slice(0, 40), modules: t.modules.map((m) => m.name) })),
      answers: out.answers.map((a) => ({ turn: a.turn, lang: a.lang, title: a.title })),
    };
  })()`);
  fs.writeFileSync(path.join(WORK, 'intent-synth.json'), JSON.stringify(result, null, 1), 'utf8');
  console.log('任务：');
  for (const t of result.tasks) console.log(`  任务 ${t.turn}  intent=${t.intent}  模块=${JSON.stringify(t.modules)}  提问「${t.prompt}」`);
  console.log('回答代码：');
  for (const a of result.answers) console.log(`  turn=${a.turn}  ${a.lang}  ${a.title}`);
  app.exit(0);
});
