// 左侧浏览区数据推导：按工作区分组、本地+远端搜索合并（与官方 ui-workspace tree.ts 角色一致）
import type { SessionListState, WorkspaceView, SessionSummary } from '../types.ts'

/** 会话行（渲染最小面） */
export interface SessionNode {
  id: string
  session: SessionSummary
  workspaceLabel: string
  snippet?: string
}

/** 一个工作区分组（含未分组桶） */
export interface GroupNode {
  key: string
  workspaceId: string | undefined
  label: string
  cwd: string | undefined
  sessionCount: number
  containsCurrent: boolean
  sessions: SessionNode[]
}

/**
 * 由会话列表 + 工作区注册表推导分组：
 * - 每个工作区一个组（按 Host 顺序，组内按 workspace.sessionIds 顺序）
 * - 未归属任何工作区的会话收进「未分组」桶
 * - 归档会话隐藏；blank 会话仅当它恰好是当前会话时显示
 */
export function deriveGroups(
  list: Pick<SessionListState, 'ids' | 'byId' | 'current'>,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[],
): GroupNode[] {
  const archived = new Set(archivedSessionIds)
  const current = list.current
  const groups: GroupNode[] = []
  const accounted = new Set<string>()

  const visible = (id: string): SessionSummary | undefined => {
    const s = list.byId[id]
    if (!s) return undefined
    if (archived.has(s.id)) return undefined
    if (s.blank && s.id !== current) return undefined
    return s
  }

  for (const ws of workspaces) {
    const sessions: SessionNode[] = []
    for (const sid of ws.sessionIds) {
      const s = visible(sid)
      if (!s) continue
      accounted.add(sid)
      sessions.push({ id: s.id, session: s, workspaceLabel: ws.title })
    }
    groups.push({
      key: ws.workspaceId,
      workspaceId: ws.workspaceId,
      label: ws.title,
      cwd: ws.path,
      sessionCount: sessions.length,
      containsCurrent: sessions.some((n) => n.id === current),
      sessions,
    })
  }

  const ungrouped: SessionNode[] = []
  for (const id of list.ids) {
    if (accounted.has(id)) continue
    const s = visible(id)
    if (!s) continue
    ungrouped.push({ id: s.id, session: s, workspaceLabel: '' })
  }
  if (ungrouped.length > 0) {
    groups.push({
      key: '',
      workspaceId: undefined,
      label: '',
      cwd: undefined,
      sessionCount: ungrouped.length,
      containsCurrent: ungrouped.some((n) => n.id === current),
      sessions: ungrouped,
    })
  }
  return groups
}

export interface RemoteSearch {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: Array<{ sessionId: string; snippet: string }>
  hasMore: boolean
}

/**
 * 合并搜索：本地标题/cwd/工作区子串命中（newest first）+ 远端内容命中（去重补尾），
 * 截断到 limit。blank 会话不参与搜索。
 */
export function deriveSearchRows(
  list: Pick<SessionListState, 'ids' | 'byId'>,
  workspaces: readonly WorkspaceView[],
  query: string,
  remote: RemoteSearch,
  limit: number,
): SessionNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const wsOf = new Map<string, WorkspaceView>()
  for (const ws of workspaces) {
    for (const sid of ws.sessionIds) wsOf.set(sid, ws)
  }
  const local: SessionNode[] = []
  for (const id of list.ids) {
    const s = list.byId[id]
    if (!s || s.blank) continue
    const ws = wsOf.get(id)
    const wsLabel = ws ? ws.title : ''
    const hay = (s.displayTitle + ' ' + (s.cwd || '') + ' ' + wsLabel).toLowerCase()
    if (!hay.includes(q)) continue
    local.push({ id, session: s, workspaceLabel: wsLabel })
  }
  local.sort((a, b) => b.session.updatedAt - a.session.updatedAt)
  const seen = new Set(local.map((r) => r.id))
  const merged = [...local]
  if (remote && remote.status === 'ready') {
    for (const item of remote.items) {
      if (seen.has(item.sessionId)) continue
      const s = list.byId[item.sessionId]
      if (!s || s.blank) continue
      const ws = wsOf.get(item.sessionId)
      seen.add(item.sessionId)
      merged.push({ id: item.sessionId, session: s, workspaceLabel: ws ? ws.title : '', snippet: item.snippet })
    }
  }
  return merged.slice(0, limit)
}
