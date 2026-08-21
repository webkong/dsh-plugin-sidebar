// 右侧 Git 状态分类：XY 双字母状态 → 徽标 / 暂存段 / 未暂存段 / 未跟踪判定
import type { GitStatusEntry } from '../types.ts'

const STAGE_LETTERS: Record<string, string> = { M: 'M', A: 'A', D: 'D', R: 'R', C: 'C' }

/** 显示徽标：优先索引字母（X），其次工作区字母（Y），未跟踪为 '?' */
export function badgeOf(entry: GitStatusEntry): string {
  const index = entry.xy[0]
  const worktree = entry.xy[1]
  if (index && index !== ' ' && index !== '?') return STAGE_LETTERS[index] || index
  if (worktree && worktree !== ' ' && worktree !== '?') return STAGE_LETTERS[worktree] || worktree
  return '?'
}

/** 由 porcelain XY 字符串直接推导徽标字母（文件树行用，避免构造对象） */
export function badgeFromXy(xy: string): string {
  return badgeOf({ path: '', xy })
}

/** 徽标 title：状态含义的本地化键（'status.modified' 等） */
export function badgeTitleKey(xy: string): string {
  const b = badgeFromXy(xy)
  switch (b) {
    case 'M': return 'status.modified'
    case 'A': return 'status.added'
    case 'D': return 'status.deleted'
    case 'R': return 'status.renamed'
    case 'C': return 'status.renamed'
    default: return 'status.untracked'
  }
}

/** 是否带暂存（索引）更改 */
export function isStaged(entry: GitStatusEntry): boolean {
  const i = entry.xy[0]
  return i !== undefined && i !== ' ' && i !== '?'
}

/** 是否带未暂存（工作区）更改；`??` 计入未暂存（仅工作区存在） */
export function isUnstaged(entry: GitStatusEntry): boolean {
  if (entry.xy === '??') return true
  const w = entry.xy[1]
  return w !== undefined && w !== ' ' && w !== '?'
}

/** 是否未跟踪（`??`） */
export function isUntracked(entry: GitStatusEntry): boolean {
  return badgeOf(entry) === '?'
}
