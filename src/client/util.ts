// 共享工具：相对时间、路径 basename、会话状态推导（左右侧栏共用）
import type { SessionSummary } from './types.ts'
import type { Translate } from './i18n.ts'

/** 相对时间桶（镜像官方行尾时间分桶） */
export function relativeTime(updatedAt: number, now: number): { unit: 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years'; n: number } {
  const MIN = 60000
  const HOUR = 3600000
  const DAY = 86400000
  const diff = Math.max(0, now - updatedAt)
  if (diff < MIN) return { unit: 'now', n: 0 }
  if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) }
  if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) }
  if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) }
  if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) }
  return { unit: 'years', n: Math.floor(diff / (365 * DAY)) }
}

/** 本地化的相对时间标签 */
export function timeLabel(updatedAt: number, now: number, t: Translate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t('time.' + unit, { n })
}

/** 路径末段（工作区显示名） */
export function baseName(path: string | undefined): string {
  if (!path) return ''
  const clean = String(path).replace(/[\\/]+$/, '')
  const parts = clean.split(/[\\/]/)
  return parts[parts.length - 1] || ''
}

/** 会话状态推导：pending 优先（等待交互），其次 running，其次 completed，默认 idle */
export function sessionStatus(s: SessionSummary): 'pending' | 'running' | 'completed' | 'idle' {
  if (s.pendingInteraction) return 'pending'
  if (s.running) return 'running'
  if (s.completed) return 'completed'
  return 'idle'
}

/** 等待交互类型的本地化标签 */
export function pendingLabel(kind: SessionSummary['pendingInteraction'], t: Translate): string {
  if (kind === 'approval') return t('status.approval')
  if (kind === 'question') return t('status.question')
  if (kind === 'plan-review') return t('status.plan-review')
  return t('status.pending')
}

/** 从任意抛出值提取可读错误消息（catch 分支统一使用） */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
