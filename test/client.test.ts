// dsh-plugin-sidebar Client 纯函数单元测试：util / left derive / right derive
// 这些模块无 React/DOM 依赖，可经 type stripping 直接 import。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relativeTime, timeLabel, baseName, sessionStatus, pendingLabel } from '../src/client/util.ts'
import { deriveGroups, deriveSearchRows } from '../src/client/left/derive.ts'
import { badgeOf, isStaged, isUnstaged, isUntracked } from '../src/client/right/derive.ts'

// ── util ─────────────────────────────────────────────────────────────
test('relativeTime 分桶', () => {
  const now = 1_000_000_000_000
  assert.deepEqual(relativeTime(now - 30_000, now), { unit: 'now', n: 0 })
  assert.deepEqual(relativeTime(now - 5 * 60_000, now), { unit: 'minutes', n: 5 })
  assert.deepEqual(relativeTime(now - 3 * 3_600_000, now), { unit: 'hours', n: 3 })
  assert.deepEqual(relativeTime(now - 2 * 86_400_000, now), { unit: 'days', n: 2 })
  assert.deepEqual(relativeTime(now - 40 * 86_400_000, now), { unit: 'months', n: 1 })
  assert.deepEqual(relativeTime(now - 400 * 86_400_000, now), { unit: 'years', n: 1 })
})

test('timeLabel 跟随词典', () => {
  const t = (key) => ({ 'time.now': '刚刚', 'time.minutes': key }[key] ?? key)
  assert.equal(timeLabel(Date.now() - 10_000, Date.now(), t), '刚刚')
})

test('baseName 取末段（含分隔符清理）', () => {
  assert.equal(baseName('/a/b/c.txt'), 'c.txt')
  assert.equal(baseName('/a/b/'), 'b')
  assert.equal(baseName(''), '')
  assert.equal(baseName(undefined), '')
})

test('sessionStatus 优先级：pending > running > completed > idle', () => {
  assert.equal(sessionStatus({ pendingInteraction: 'approval', running: true }), 'pending')
  assert.equal(sessionStatus({ running: true, completed: true }), 'running')
  assert.equal(sessionStatus({ completed: true }), 'completed')
  assert.equal(sessionStatus({}), 'idle')
})

test('pendingLabel 分类', () => {
  const t = (key) => key
  assert.equal(pendingLabel('approval', t), 'status.approval')
  assert.equal(pendingLabel('question', t), 'status.question')
  assert.equal(pendingLabel('plan-review', t), 'status.plan-review')
  assert.equal(pendingLabel(undefined, t), 'status.pending')
})

// ── left/derive：deriveGroups ────────────────────────────────────────
const sess = (id, over = {}) => ({
  id,
  displayTitle: 'title-' + id,
  running: false,
  blank: false,
  updatedAt: 0,
  ...over,
})

test('deriveGroups 按工作区分组、保留会话顺序', () => {
  const list = {
    ids: ['s1', 's2', 's3'],
    byId: { s1: sess('s1'), s2: sess('s2'), s3: sess('s3') },
    current: 's1',
  }
  const ws = [
    { workspaceId: 'w1', path: '/a', title: 'Alpha', sessionIds: ['s2', 's1'] },
    { workspaceId: 'w2', path: '/b', title: 'Beta', sessionIds: ['s3'] },
  ]
  const groups = deriveGroups(list, ws, [])
  assert.equal(groups.length, 2)
  assert.equal(groups[0].label, 'Alpha')
  assert.deepEqual(groups[0].sessions.map((n) => n.id), ['s2', 's1'])
  assert.equal(groups[0].containsCurrent, true)
  assert.equal(groups[0].sessionCount, 2)
})

test('deriveGroups 未归属会话进未分组桶', () => {
  const list = {
    ids: ['s1', 's2'],
    byId: { s1: sess('s1'), s2: sess('s2') },
    current: undefined,
  }
  const groups = deriveGroups(list, [], [])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].workspaceId, undefined)
  assert.deepEqual(groups[0].sessions.map((n) => n.id), ['s1', 's2'])
})

test('deriveGroups 归档会话隐藏', () => {
  const list = {
    ids: ['s1'],
    byId: { s1: sess('s1') },
    current: undefined,
  }
  const groups = deriveGroups(list, [], ['s1'])
  assert.equal(groups.length, 0)
})

test('deriveGroups blank 会话仅当前显示', () => {
  const list = {
    ids: ['blank1', 's1'],
    byId: { blank1: sess('blank1', { blank: true }), s1: sess('s1') },
    current: 's1',
  }
  const groups = deriveGroups(list, [], [])
  // blank1 非当前 → 隐藏；只剩 s1
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].sessions.map((n) => n.id), ['s1'])
})

// ── left/derive：deriveSearchRows ────────────────────────────────────
test('deriveSearchRows 标题/工作区子串匹配、newest first', () => {
  const list = {
    ids: ['s1', 's2', 's3'],
    byId: {
      s1: sess('s1', { displayTitle: 'Alpha Session', updatedAt: 100 }),
      s2: sess('s2', { displayTitle: 'Beta', cwd: '/alpha/dir', updatedAt: 200 }),
      s3: sess('s3', { displayTitle: 'Gamma', updatedAt: 300 }),
    },
  }
  const ws = [{ workspaceId: 'w1', path: '/a', title: 'AlphaWS', sessionIds: ['s3'] }]
  const rows = deriveSearchRows(list, ws, 'alpha', { status: 'idle', items: [], hasMore: false }, 20)
  // s1 标题命中、s2 cwd 命中、s3 工作区命中
  assert.deepEqual(rows.map((r) => r.id), ['s3', 's2', 's1'])
})

test('deriveSearchRows 远端内容命中补尾、去重', () => {
  const list = {
    ids: ['s1'],
    byId: { s1: sess('s1', { displayTitle: 'Alpha', updatedAt: 100 }), s2: sess('s2', { displayTitle: 'Beta', updatedAt: 50 }) },
  }
  const remote = { status: 'ready', items: [{ sessionId: 's2', snippet: 'match' }], hasMore: false }
  const rows = deriveSearchRows(list, [], 'alpha', remote, 20)
  assert.deepEqual(rows.map((r) => r.id), ['s1', 's2'])
  assert.equal(rows[1].snippet, 'match')
})

test('deriveSearchRows 空查询返回空', () => {
  const list = { ids: ['s1'], byId: { s1: sess('s1') } }
  assert.deepEqual(deriveSearchRows(list, [], '   ', { status: 'idle', items: [], hasMore: false }, 20), [])
})

// ── right/derive：git 状态分类 ───────────────────────────────────────
test('badgeOf 索引字母优先', () => {
  assert.equal(badgeOf({ path: 'a', xy: 'M ' }), 'M')
  assert.equal(badgeOf({ path: 'a', xy: ' M' }), 'M')
  assert.equal(badgeOf({ path: 'a', xy: '??' }), '?')
  assert.equal(badgeOf({ path: 'a', xy: 'A ' }), 'A')
  assert.equal(badgeOf({ path: 'a', xy: ' D' }), 'D')
})

test('isStaged / isUnstaged / isUntracked 分类', () => {
  assert.equal(isStaged({ path: 'a', xy: 'M ' }), true)
  assert.equal(isStaged({ path: 'a', xy: ' M' }), false)
  assert.equal(isUnstaged({ path: 'a', xy: ' M' }), true)
  assert.equal(isUnstaged({ path: 'a', xy: '??' }), true)
  assert.equal(isUnstaged({ path: 'a', xy: 'M ' }), false)
  assert.equal(isUntracked({ path: 'a', xy: '??' }), true)
  assert.equal(isUntracked({ path: 'a', xy: 'M ' }), false)
})

test('同时含暂存与未暂存（MM）双段命中', () => {
  const e = { path: 'a', xy: 'MM' }
  assert.equal(isStaged(e), true)
  assert.equal(isUnstaged(e), true)
})
