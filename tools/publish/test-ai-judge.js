/**
 * AI 判定模块的单元测试（不花钱）：
 *   ① 能从凭据文件里读到密钥（只打印长度）
 *   ② 能解析模型返回的 JSON（含围栏/夹带解释）
 *   ③ 缓存命中时不再调用接口
 *   ④ 没有密钥时给出明确错误
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readApiKey, parseVerdict, judgeCodes, hashCode } = require(
  'E:\\DeepSeekHarness\\desktop\\src\\ai-judge.js',
);

const HOME = 'E:\\DeepSeekHarness\\home';
const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(`✓ ${name}`);
  } catch (error) {
    results.push(`✗ ${name} → ${error.message}`);
    process.exitCode = 1;
  }
};

(async () => {
  const key = readApiKey(HOME);
  check('能从 .credentials.yaml 读到密钥', () => {
    assert.ok(typeof key === 'string' && key.length > 20, '没读到密钥');
  });
  console.log(`（密钥长度 ${key ? key.length : 0}，不打印内容）`);

  check('parseVerdict 能解析干净 JSON', () => {
    const v = parseVerdict('{"usable":true,"feature":"气泡图绘制","reason":"有主流程可直接运行"}');
    assert.equal(v.usable, true);
    assert.equal(v.feature, '气泡图绘制');
  });
  check('parseVerdict 容忍 ```json 围栏与多余解释', () => {
    const v = parseVerdict('好的，结论如下：\n```json\n{"usable": false, "feature": "片段", "reason": "只有两行"}\n```\n以上。');
    assert.equal(v.usable, false);
    assert.equal(v.reason, '只有两行');
  });
  check('parseVerdict 对无效输入返回 null', () => {
    assert.equal(parseVerdict('我觉得可以'), null);
    assert.equal(parseVerdict('{"feature":"x"}'), null);
  });
  check('hashCode 稳定且区分语言/内容', () => {
    assert.equal(hashCode('python', 'print(1)'), hashCode('python', 'print(1)'));
    assert.notEqual(hashCode('python', 'print(1)'), hashCode('r', 'print(1)'));
  });

  // 缓存命中：手工写一份缓存，确认不再调用接口（calls 应为 0）
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-judge-test-'));
  const sample = { id: 'a', lang: 'python', name: 'x.py', code: 'print("hi")\nprint("there")\n' };
  const cacheDir = path.join(tmpHome, 'cache', 'code-history');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'judge.json'),
    JSON.stringify({
      version: 1,
      items: { [hashCode(sample.lang, sample.code)]: { usable: true, feature: '打印', reason: '缓存命中', at: Date.now(), model: 'test' } },
    }),
  );
  const cachedRun = await judgeCodes(tmpHome, [sample]);
  check('缓存命中时不再调用接口', () => {
    assert.equal(cachedRun.calls, 0);
    assert.equal(cachedRun.results.a.cached, true);
    assert.equal(cachedRun.results.a.feature, '打印');
  });

  // 没有密钥时应给出明确错误（临时目录里没有 .credentials.yaml）
  const noKeyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-judge-nokey-'));
  const noKey = await judgeCodes(noKeyHome, [sample], { maxCalls: 1 });
  check('没有密钥时返回明确错误', () => {
    assert.equal(noKey.ok, false);
    assert.match(noKey.error, /密钥/);
  });

  console.log(results.join('\n'));
})();
