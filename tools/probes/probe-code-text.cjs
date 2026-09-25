/**
 * 合成数据验证「代码和文本」新逻辑：
 *   ① 代码：片段(<10行、无入口) → complete:false；完整脚本(import+主流程) → complete:true
 *   ② 文本：同一文件写两版 → 只留最后一版，versions=2
 *   ③ 文本：回答正文被反复润色 → 合并成一条，versions=2，内容取最新
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const WORK = process.env.DSH_WORK || path.join(__dirname, '..');
const LOGS = 'E:\\DeepSeekHarness\\logs';
const PROFILE = process.argv[2] || '.electron-scratch-codetext';

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

const FULL = `import pandas as pd
import matplotlib.pyplot as plt

def main():
    df = pd.read_csv("points.csv")
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.scatter(df["x"], df["y"], s=df["size"])
    fig.savefig("bubble.png", dpi=200)
    print("saved bubble.png", len(df), "points")

if __name__ == "__main__":
    main()
`;

const FRAGMENT = `df = df.dropna()
df.to_csv("clean.csv")`;

const DOC_V1 = `# 摘要（第一版）

本文研究了 XXX 与 YYY 之间的关系，并给出了初步结论，说明二者存在显著相关性。
（这一版是初稿，后面又被改过两次，所以不该出现在文本历史里。）`;

const DOC_V2 = `# 摘要（最终版）

本文围绕 XXX 展开，提出 YYY 框架，并在 ZZZ 数据集上完成了验证，结论稳健。
（这是最后一版，文本历史里应该只保留这一份。）`;

const PROSE_V1 = `# 引言（初稿）

近年来，相关研究不断涌现……
（这是第一版的引言，写得比较粗糙。）`;

const PROSE_V2 = `# 引言（终稿）

近年来，相关研究不断涌现，并逐步走向体系化……
（这是修改后的版本，应当只显示这一版。）`;

const TRAJ = {
  eventNodes: [
    { turn: 0, time: 1, blocks: [{ kind: 'user', content: '帮我把这段摘要润色一下' }] },
    {
      turn: 1,
      time: 2,
      blocks: [
        { kind: 'tool-call', text: JSON.stringify({ file_path: 'D:\\\\out\\\\摘要.md', content: DOC_V1 }) },
        { kind: 'text', text: PROSE_V1 },
      ],
    },
    { turn: 1, time: 3, blocks: [{ kind: 'user', content: '再润色一遍摘要，语气更学术；顺便把引言也改一下' }] },
    {
      turn: 2,
      time: 4,
      blocks: [
        { kind: 'tool-call', text: JSON.stringify({ file_path: 'D:\\\\out\\\\摘要.md', content: DOC_V2 }) },
        { kind: 'text', text: PROSE_V2 },
      ],
    },
    { turn: 2, time: 5, blocks: [{ kind: 'user', content: '用 python 帮我画一张气泡图，数据在 points.csv' }] },
    {
      turn: 3,
      time: 6,
      blocks: [
        { kind: 'tool-call', text: JSON.stringify({ file_path: 'D:\\\\out\\\\bubble.py', content: FULL }) },
        { kind: 'tool-call', text: JSON.stringify({ file_path: 'D:\\\\out\\\\snippet.py', content: FRAGMENT }) },
        { kind: 'text', text: '画好了，图在 bubble.png。' },
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
  const out = await win.webContents.executeJavaScript(`(() => {
    const data = window.__CH_INTENT__.extract(${JSON.stringify(TRAJ)}, []);
    return {
      tasks: data.tasks.map((t) => ({
        turn: t.turn,
        intent: t.intent,
        modules: t.modules.map((m) => ({ name: m.name, complete: m.complete, reason: m.reason, lines: m.lines })),
      })),
      texts: data.texts.map((t) => ({ title: t.title, source: t.source, versions: t.versions, chars: t.chars, head: String(t.text).slice(0, 28).replace(/\\n/g, ' ') })),
    };
  })()`);
  fs.writeFileSync(path.join(WORK, 'code-text-check.json'), JSON.stringify(out, null, 1), 'utf8');
  console.log('=== 代码（完整性判定） ===');
  for (const t of out.tasks) {
    console.log(`  任务 ${t.turn}  intent=${t.intent}`);
    for (const m of t.modules) console.log(`     ${m.name}  complete=${m.complete} (${m.reason})  ${m.lines} 行`);
  }
  console.log('=== 文本成品（版本折叠） ===');
  for (const t of out.texts) console.log(`  [${t.source}] ${t.title}  共${t.versions}版  ${t.chars}字  「${t.head}」`);

  // 额外：同一文件写两版，检查版本计数
  const case2 = await win.webContents.executeJavaScript(`(() => {
    const traj = { eventNodes: [
      { turn: 1, time: 1, blocks: [{ kind: 'tool-call', text: JSON.stringify({ file_path: 'D:\\\\\\\\x\\\\\\\\a.md', content: 'AAA' + '甲'.repeat(60) }) }] },
      { turn: 2, time: 2, blocks: [{ kind: 'tool-call', text: JSON.stringify({ file_path: 'D:\\\\\\\\x\\\\\\\\a.md', content: 'BBB' + '乙'.repeat(60) }) }] },
    ] };
    const data = window.__CH_INTENT__.extract(traj, []);
    return data.texts.map((t) => ({ title: t.title, versions: t.versions, head: String(t.text).slice(0, 6) }));
  })()`);
  console.log('=== 同文件两版 ===');
  for (const t of case2) console.log(`  ${t.title}  共${t.versions}版  内容开头=${t.head}`);
  app.exit(0);
});
