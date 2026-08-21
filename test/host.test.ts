// dsh-plugin-sidebar 纯函数单元测试（node:test + assert，零外部依赖）
// 直接 import src 下的纯函数模块（Node 24 type stripping 支持带 .ts 扩展名的相对导入）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLoopback, shq, shellJoin } from '../src/host/http.ts'
import { parsePorcelainZ, parseLogLines, isGitRepo, status, diff, branches } from '../src/host/git.ts'

// ── http ────────────────────────────────────────────────────────────
test('isLoopback 识别回环地址', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('localhost'), true)
  assert.equal(isLoopback(undefined), false)
  assert.equal(isLoopback('192.168.1.5'), false)
})

test('shq 单引号转义（含内嵌引号）', () => {
  assert.equal(shq('main'), "'main'")
  assert.equal(shq("it's"), "'it'\\''s'")
  assert.equal(shq(''), "''")
})

test('shellJoin 安全字符直拼、危险字符转义', () => {
  // 安全字符集：A-Za-z0-9 _ . / : @ -（无 = 等）
  assert.equal(shellJoin(['status', '--no-color', '-U3']), 'status --no-color -U3')
  assert.equal(shellJoin(['add', '--', 'a b.txt']), "add -- 'a b.txt'")
  assert.equal(shellJoin(['commit', '-m', "fix: don't"]), "commit -m 'fix: don'\\''t'")
  // 含 = 的参数属于保守转义范围
  assert.equal(shellJoin(['status', '--porcelain=v1']), "status '--porcelain=v1'")
})

// ── git 解析器 ───────────────────────────────────────────────────────
test('parsePorcelainZ 解析 NUL 帧（普通/未跟踪/重命名）', () => {
  // ' M a.txt\0?? b.txt\0'
  const entries = parsePorcelainZ(' M a.txt\0?? b.txt\0')
  assert.deepEqual(entries, [
    { path: 'a.txt', xy: ' M' },
    { path: 'b.txt', xy: '??' },
  ])
})

test('parsePorcelainZ 重命名条目跳过源路径字段', () => {
  // 'R  new.txt\0old.txt\0'
  const entries = parsePorcelainZ('R  new.txt\0old.txt\0')
  assert.deepEqual(entries, [{ path: 'new.txt', xy: 'R ' }])
})

test('parsePorcelainZ 空输出返回空数组', () => {
  assert.deepEqual(parsePorcelainZ(''), [])
  assert.deepEqual(parsePorcelainZ('\0\0'), [])
})

test('parseLogLines 解析 %x1f 分隔行', () => {
  const rows = parseLogLines('abc123\u001ffix bug\u001fAlice\u001f2026-01-01 10:00:00 +0800\u001fabc1234567\u001fHEAD -> main\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].hash, 'abc123')
  assert.equal(rows[0].subject, 'fix bug')
  assert.equal(rows[0].author, 'Alice')
  assert.equal(rows[0].hashFull, 'abc1234567')
  assert.equal(rows[0].refs, 'HEAD -> main')
})

test('parseLogLines 缺字段行跳过、空行跳过', () => {
  // 'hash\u001fsubject' 两字段即视为有效（author/date/hashFull/refs 缺省为空）
  const rows = parseLogLines('\nabc\u001fsubject\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].hash, 'abc')
  assert.equal(rows[0].subject, 'subject')
  assert.equal(rows[0].author, '')
  assert.equal(rows[0].refs, '')
})

// ── git 命令层（mock shell）─────────────────────────────────────────
function mockShell(routes) {
  return {
    resolve: (req) => ({ ...req }),
    run: async (spec) => {
      const command = spec.command
      // 精确前缀匹配：routes 键是命令起始片段（含引号转义后的参数）
      for (const [needle, out] of Object.entries(routes)) {
        if (command.startsWith(needle)) {
          return { exitCode: 0, stdout: { text: out }, stderr: { text: '' } }
        }
      }
      return { exitCode: 1, stdout: { text: '' }, stderr: { text: 'unexpected: ' + command } }
    },
  }
}

test('isGitRepo 判定工作树', async () => {
  const inRepo = mockShell({ 'git rev-parse --is-inside-work-tree': 'true\n' })
  assert.equal(await isGitRepo(inRepo, '/repo'), true)
  const notRepo = mockShell({})
  assert.equal(await isGitRepo(notRepo, '/plain'), false)
})

test('status 非仓库返回 isRepo:false', async () => {
  const shell = mockShell({})
  const res = await status(shell, '/plain')
  assert.deepEqual(res, { isRepo: false, entries: [] })
})

test('status 仓库返回分支与条目', async () => {
  const shell = mockShell({
    'git rev-parse --is-inside-work-tree': 'true\n',
    'git rev-parse --abbrev-ref HEAD': 'main\n',
    'git status': ' M a.txt\0?? b.txt\0',
  })
  const res = await status(shell, '/repo')
  assert.equal(res.isRepo, true)
  assert.equal(res.branch, 'main')
  assert.deepEqual(res.entries, [
    { path: 'a.txt', xy: ' M' },
    { path: 'b.txt', xy: '??' },
  ])
})

test('diff 携带 staged 标志与路径', async () => {
  let captured = ''
  const shell = {
    resolve: (req) => ({ ...req }),
    run: async (spec) => { captured = spec.command; return { exitCode: 0, stdout: { text: 'diff --git a/a.txt b/a.txt\n' }, stderr: { text: '' } } },
  }
  await diff(shell, '/repo', 'a.txt', true)
  assert.match(captured, /--cached/)
  assert.match(captured, /a\.txt$/)
})

test('branches 当前分支在前、去重', async () => {
  const shell = mockShell({
    'git rev-parse --abbrev-ref HEAD': 'main\n',
    'git for-each-ref': 'main\ndev\nfeature\n',
  })
  const res = await branches(shell, '/repo')
  assert.equal(res.current, 'main')
  assert.deepEqual(res.names, ['main', 'dev', 'feature'])
})
