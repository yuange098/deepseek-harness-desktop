/**
 * 单元测试：会话删除模块（用临时目录造的假数据，不碰真实 home）。
 * 覆盖：列清单、真删、清理 workspace.json 引用、拒绝非法 id / 路径穿越。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { deleteSessionData, planSessionDeletion, isValidSessionId } = require(
  'E:\\DeepSeekHarness\\desktop\\src\\session-store.js',
);

const SID = 'session-11111111-2222-3333-4444-555555555555';
const OTHER = 'session-99999999-8888-7777-6666-555555555555';
const WS = '--E-Test-workspace--';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-session-test-'));
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const touch = (p, text = 'x') => {
  mkdir(path.dirname(p));
  fs.writeFileSync(p, text, 'utf8');
};

// 造假数据：两个会话 + 一个无关文件
touch(path.join(home, 'sessions', WS, SID, 'session.v4.jsonl.zstd'), 'record-A');
touch(path.join(home, 'sessions', WS, OTHER, 'session.v4.jsonl.zstd'), 'record-B');
touch(path.join(home, 'sessions', WS, 'keep.txt'), 'not-a-session');
touch(path.join(home, 'storages', 'session_projcache', 'sessions', `${SID}.json`), '{}');
touch(path.join(home, 'attachments', 'v1', 'objects', 'ab', 'deadbeef'), 'shared');
fs.writeFileSync(
  path.join(home, 'storages', 'workspace.json'),
  JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, defaultWorkspaceId: 'w1', workspaceIds: ['w1'], archivedSessionIds: [SID], pinnedSessionIds: [SID, OTHER] },
    tables: { workspaces: { w1: { path: 'E:\\Test', title: 'test', sessionIds: [SID, OTHER], createdAt: 'x', updatedAt: 'y' } } },
  }),
  'utf8',
);

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
  check('非法 id 被拒绝', () => {
    assert.equal(isValidSessionId('../../etc/passwd'), false);
    assert.equal(isValidSessionId('session-not-a-uuid'), false);
    assert.equal(isValidSessionId(''), false);
    assert.equal(isValidSessionId(SID), true);
    assert.equal(isValidSessionId(SID.replace('session-', '')), true);
  });

  const dry = await deleteSessionData(home, SID, { dryRun: true });
  check('dry-run 列出的目标正好是会话目录 + 缓存文件', () => {
    assert.equal(dry.ok, true);
    assert.equal(dry.targets.length, 2);
    assert.ok(dry.targets.some((t) => t.endsWith(path.join(WS, SID))));
    assert.ok(dry.targets.some((t) => t.endsWith(`${SID}.json`)));
  });

  check('dry-run 之后数据仍在（没有误删）', () => {
    assert.ok(fs.existsSync(path.join(home, 'sessions', WS, SID, 'session.v4.jsonl.zstd')));
  });

  const bad = await deleteSessionData(home, '../evil');
  check('路径穿越的 id 直接拒绝', () => {
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'invalid-session-id');
  });

  const done = await deleteSessionData(home, SID);
  check('真删：返回 ok 且报告清理处数', () => {
    assert.equal(done.ok, true);
    assert.equal(done.removed.length, 2);
    assert.equal(done.failed.length, 0);
    assert.equal(done.registryChanged, true);
  });

  check('真删：会话目录与缓存文件都没了', () => {
    assert.equal(fs.existsSync(path.join(home, 'sessions', WS, SID)), false);
    assert.equal(fs.existsSync(path.join(home, 'storages', 'session_projcache', 'sessions', `${SID}.json`)), false);
  });

  check('真删：别的会话与共享附件都还在', () => {
    assert.ok(fs.existsSync(path.join(home, 'sessions', WS, OTHER, 'session.v4.jsonl.zstd')));
    assert.ok(fs.existsSync(path.join(home, 'sessions', WS, 'keep.txt')));
    assert.ok(fs.existsSync(path.join(home, 'attachments', 'v1', 'objects', 'ab', 'deadbeef')));
  });

  check('真删：workspace.json 里的登记被摘掉（sessionIds / pinned / archived）', () => {
    const data = JSON.parse(fs.readFileSync(path.join(home, 'storages', 'workspace.json'), 'utf8'));
    assert.deepEqual(data.tables.workspaces.w1.sessionIds, [OTHER]);
    assert.deepEqual(data.global.archivedSessionIds, []);
    assert.deepEqual(data.global.pinnedSessionIds, [OTHER]);
  });

  check('真删：workspace.json 仍是合法 JSON 且没有留下临时文件', () => {
    const dir = path.join(home, 'storages');
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftovers, []);
  });

  console.log(results.join('\n'));
  console.log(`\n临时测试目录：${home}`);
})().catch((error) => {
  console.error('测试崩了：', error);
  process.exitCode = 1;
});
