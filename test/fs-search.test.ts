// dsh-plugin-sidebar Host fs/search 单元测试（node:test + assert，mock 服务）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listDir, readText } from '../src/host/fs.ts'
import { searchNames, searchContent } from '../src/host/search.ts'

// ── fs（mock FsService）──────────────────────────────────────────────
function mockFs(files) {
  // files: { [dir]: [{ name, type }] }；resolve 返回 { displayPath }
  return {
    resolve: async (path) => ({ displayPath: path }),
    stat: async (target) => {
      for (const [dir, entries] of Object.entries(files)) {
        for (const e of entries) {
          if (dir + '/' + e.name === target.displayPath || target.displayPath.endsWith('/' + e.name)) {
            return { type: e.type, size: e.size ?? 0 }
          }
        }
      }
      return undefined
    },
    listDir: async (target) => files[target.displayPath] || [],
    readText: async (target) => `content-of:${target.displayPath}`,
    readBytes: async () => new Uint8Array(),
  }
}

test('listDir 返回条目（name/type/size）', async () => {
  const fs = mockFs({
    '/repo': [
      { name: 'a.txt', type: 'file', size: 10 },
      { name: 'src', type: 'directory' },
    ],
  })
  const res = await listDir(fs, '/repo')
  assert.equal(res.ok, true)
  assert.deepEqual(res.entries, [
    { name: 'a.txt', type: 'file', size: 10 },
    { name: 'src', type: 'directory', size: undefined },
  ])
})

test('listDir fs 不可用抛错', async () => {
  await assert.rejects(() => listDir(undefined, '/repo'), /fs 服务不可用/)
})

test('readText 小文件返回全文', async () => {
  const fs = mockFs({ '/repo': [{ name: 'a.txt', type: 'file', size: 5 }] })
  const res = await readText(fs, '/repo/a.txt')
  assert.equal(res.ok, true)
  assert.equal(res.kind, 'text')
  assert.equal(res.content, 'content-of:/repo/a.txt')
  assert.equal(res.truncated, false)
})

test('readText 大文件截断到 512KB 并标记', async () => {
  const big = 'x'.repeat(600 * 1024)
  const fs = {
    resolve: async (path) => ({ displayPath: path }),
    stat: async () => ({ type: 'file', size: 600 * 1024 }),
    listDir: async () => [],
    readText: async () => big,
    readBytes: async (_t, _s, max) => new TextEncoder().encode(big.slice(0, max)),
  }
  const res = await readText(fs, '/repo/big.txt')
  assert.equal(res.kind, 'text')
  assert.equal(res.truncated, true)
  assert.equal(res.content.length, 512 * 1024)
})

test('readText 目录返回 binary 提示', async () => {
  const fs = mockFs({ '/repo': [{ name: 'src', type: 'directory' }] })
  const res = await readText(fs, '/repo/src')
  assert.equal(res.kind, 'binary')
})

// ── searchNames（文件名递归匹配）────────────────────────────────────
test('searchNames 大小写不敏感匹配文件名（含子目录）', async () => {
  const fs = mockFs({
    '/repo': [
      { name: 'README.md', type: 'file' },
      { name: 'src', type: 'directory' },
    ],
    '/repo/src': [{ name: 'Main.tsx', type: 'file' }],
  })
  const res = await searchNames(fs, '/repo', 'main', { maxVisited: 100 })
  assert.equal(res.truncated, false)
  assert.deepEqual(res.matches, [
    { path: 'src/Main.tsx', isDir: false },
  ])
})

test('searchNames 跳过 .git 目录', async () => {
  const fs = mockFs({
    '/repo': [{ name: '.git', type: 'directory' }],
  })
  const res = await searchNames(fs, '/repo', 'git')
  assert.deepEqual(res.matches, [])
})

test('searchNames 空查询返回空结果', async () => {
  const fs = mockFs({ '/repo': [{ name: 'a.txt', type: 'file' }] })
  const res = await searchNames(fs, '/repo', '   ')
  assert.deepEqual(res.matches, [])
})

test('searchNames 超预算截断', async () => {
  const fs = mockFs({ '/repo': [{ name: 'a1.txt', type: 'file' }, { name: 'a2.txt', type: 'file' }] })
  const res = await searchNames(fs, '/repo', 'a', { maxMatches: 1 })
  assert.equal(res.truncated, true)
  assert.equal(res.matches.length, 1)
})

// ── searchContent（rg/grep 输出解析）─────────────────────────────────
function rgShell(out) {
  return {
    resolve: (req) => ({ ...req }),
    run: async () => ({ exitCode: 0, stdout: { text: out }, stderr: { text: '' } }),
  }
}

test('searchContent 解析 path:line:content 行', async () => {
  const shell = rgShell('src/a.ts:3:const x = 1\nsrc/b.ts:7:hello\n')
  const res = await searchContent(shell, '/repo', 'hello')
  assert.equal(res.matches.length, 2)
  assert.deepEqual(res.matches[0], { path: 'src/a.ts', line: 3, content: 'const x = 1' })
  assert.deepEqual(res.matches[1], { path: 'src/b.ts', line: 7, content: 'hello' })
})

test('searchContent 空查询返回空', async () => {
  const res = await searchContent(rgShell(''), '/repo', '  ')
  assert.deepEqual(res.matches, [])
})

test('searchContent rg 无命中（退出码 1）返回空', async () => {
  const shell = {
    resolve: (req) => ({ ...req }),
    run: async () => ({ exitCode: 1, stdout: { text: '' }, stderr: { text: '' } }),
  }
  const res = await searchContent(shell, '/repo', 'missing')
  assert.deepEqual(res.matches, [])
})
