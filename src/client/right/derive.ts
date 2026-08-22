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

/**
 * 目录聚合 git 状态：取该目录（含递归子目录）下所有已更改文件的最高优先级状态。
 * 优先级 D > M > A > R > U（与 VSCode 目录聚合一致）；无更改返回 null。
 * @param map path(相对，'/'分隔) → porcelain XY
 * @param rel 目录相对路径（'/'分隔）
 */
export function dirBadge(map: Record<string, string>, rel: string): string | null {
  if (rel === '') return null
  const prefix = rel + '/'
  let rank = 0
  let best = ''
  for (const [path, xy] of Object.entries(map)) {
    if (!path.startsWith(prefix)) continue
    if (xy === '??') { if (rank < 3) { rank = 3; best = '?' } continue }
    const b = xy[0] !== ' ' && xy[0] !== '?' ? xy[0] : (xy[1] !== ' ' && xy[1] !== '?' ? xy[1] : '')
    const prio = b === 'D' ? 4 : b === 'M' ? 3 : b === 'A' ? 2 : b === 'R' ? 1 : 0
    if (prio > rank) { rank = prio; best = b }
  }
  return best === '' ? null : best
}
