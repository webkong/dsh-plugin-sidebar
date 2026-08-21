// 左侧主组件：标题头 + 搜索 + 分组列表 / 搜索结果 / 空状态 / rail 窄栏
// （对齐官方 ui-workspace WorkspaceBrowser.tsx）
import React from 'react'
import { Icon, Spinner } from '../icons.tsx'
import { deriveGroups, deriveSearchRows, type RemoteSearch } from './derive.ts'
import { GroupSection, SearchRow } from './rows.tsx'
import type { Translate } from '../i18n.ts'
import type { SessionListState, WorkspaceListState } from '../types.ts'

export interface LeftInject {
  open: (sessionId: string) => void
  startSession: (workspaceId?: string) => void
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: Array<{ sessionId: string; snippet: string }>; hasMore: boolean }>
  searchResultLimit: number
  forkSession: (sessionId: string) => void
  renameSession: (sessionId: string, title: string) => Promise<void>
  archiveSession: (sessionId: string) => Promise<void>
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  addWorkspace: () => Promise<void>
  copySessionTo: (sessionId: string, workspace: { workspaceId: string; path: string; title: string }) => Promise<string | undefined>
  timeout: (fn: () => void, ms: number) => () => void
}

export interface WorkspaceBrowserProps {
  wide: boolean
  expandSidebar: () => void
  useSessions: <S>(sel: (s: SessionListState) => S) => S
  useWorkspaces: <S>(sel: (s: WorkspaceListState) => S) => S
  t: Translate
  inject: LeftInject
}

const SEARCH_DEBOUNCE_MS = 250
const EXPAND_SLIDE_MS = 300
const TICK_MS = 30000

export function WorkspaceBrowser(props: WorkspaceBrowserProps): React.ReactElement {
  const { wide, expandSidebar, useSessions, useWorkspaces, t, inject } = props
  const ids = useSessions((s) => s.ids)
  const byId = useSessions((s) => s.byId)
  const current = useSessions((s) => s.current)
  const phase = useSessions((s) => s.phase)
  const workspaces = useWorkspaces((s) => s.items)
  const archivedSessionIds = useWorkspaces((s) => s.archivedSessionIds)

  const [query, setQuery] = React.useState('')
  const [searchExpanded, setSearchExpanded] = React.useState(false)
  const [searchOnExpand, setSearchOnExpand] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set())
  const [now, setNow] = React.useState(Date.now())
  const [remote, setRemote] = React.useState<RemoteSearch>({ status: 'idle', items: [], hasMore: false })
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const searchRootRef = React.useRef<HTMLDivElement>(null)
  const searchBtnRef = React.useRef<HTMLButtonElement>(null)

  /* 相对时间 ticker：每 30s 续期刷新 */
  React.useEffect(() => {
    let disposed = false
    let handle: (() => void) | null = null
    const tick = (): void => {
      if (disposed) return
      setNow(Date.now())
      handle = inject.timeout(tick, TICK_MS)
    }
    handle = inject.timeout(tick, TICK_MS)
    return () => { disposed = true; if (handle) handle() }
  }, [inject.timeout])

  /* rail → wide 展开后聚焦搜索 */
  React.useEffect(() => {
    if (wide && searchOnExpand) {
      const dispose = inject.timeout(() => {
        setSearchOnExpand(false)
        if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true })
      }, EXPAND_SLIDE_MS)
      return dispose
    }
    return undefined
  }, [wide, searchOnExpand, inject.timeout])

  /* 远端搜索（防抖 + 取消） */
  const normalizedQuery = query.trim()
  React.useEffect(() => {
    if (!normalizedQuery) {
      setRemote({ status: 'idle', items: [], hasMore: false })
      return undefined
    }
    const ctrl = new AbortController()
    setRemote({ status: 'loading', items: [], hasMore: false })
    const dispose = inject.timeout(() => {
      inject.searchSessions(normalizedQuery, ctrl.signal).then((result) => {
        if (ctrl.signal.aborted) return
        setRemote({ status: 'ready', items: result.items, hasMore: result.hasMore })
      }).catch(() => {
        if (ctrl.signal.aborted) return
        setRemote({ status: 'error', items: [], hasMore: false })
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => { dispose(); ctrl.abort() }
  }, [normalizedQuery, inject.searchSessions, inject.timeout])

  /* 点击搜索框外部且无查询时收起搜索（忽略对搜索按钮本身的点击，避免 toggle 被立即收回） */
  React.useEffect(() => {
    if (!wide || !searchExpanded) return undefined
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node)) return
      if (searchBtnRef.current && searchBtnRef.current.contains(event.target)) return
      if (searchRootRef.current && searchRootRef.current.contains(event.target)) return
      if (searchInputRef.current) searchInputRef.current.blur()
      if (normalizedQuery === '') setSearchExpanded(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [normalizedQuery, wide, searchExpanded])

  const groups = React.useMemo(
    () => deriveGroups({ ids, byId, current }, workspaces, archivedSessionIds),
    [ids, byId, current, workspaces, archivedSessionIds],
  )
  const searchRows = React.useMemo(
    () => deriveSearchRows({ ids, byId }, workspaces, query, remote, inject.searchResultLimit),
    [ids, byId, workspaces, query, remote, inject.searchResultLimit],
  )
  const totalSessions = groups.reduce((n, g) => n + g.sessionCount, 0)
  const showSearch = searchExpanded || normalizedQuery !== ''

  const toggleGroup = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  const openSearch = (): void => {
    setSearchExpanded(true)
    setSearchOnExpand(true)
    expandSidebar()
  }

  /* 复制会话到目标工作区：成功后自动打开新会话 */
  const copyTo = async (sessionId: string, workspaceId: string): Promise<boolean> => {
    const ws = workspaces.find((w) => w.workspaceId === workspaceId)
    if (!ws) throw new Error('unknown workspace ' + workspaceId)
    const newId = await inject.copySessionTo(sessionId, { workspaceId: ws.workspaceId, path: ws.path, title: ws.title })
    if (newId) inject.open(newId)
    return true
  }

  const renderHeader = React.createElement('div', { className: 'sp-header' },
    React.createElement('div', { className: 'sp-title' }, t('workspaces.title')),
    React.createElement('button', {
      type: 'button', ref: searchBtnRef, className: 'sp-iconBtn', title: t('search'), 'aria-label': t('search'),
      onClick: () => { if (searchExpanded) setSearchExpanded(false); else { setSearchExpanded(true); setSearchOnExpand(false) } },
    }, React.createElement(Icon, { name: 'search', size: 16 })),
    React.createElement('button', { type: 'button', className: 'sp-iconBtn', title: t('addWorkspace'), 'aria-label': t('addWorkspace'), onClick: () => { void inject.addWorkspace() } },
      React.createElement(Icon, { name: 'folder', size: 16 })),
    React.createElement('button', { type: 'button', className: 'sp-iconBtn', title: t('newSession'), 'aria-label': t('newSession'), onClick: () => inject.startSession() },
      React.createElement(Icon, { name: 'plus', size: 16 })))

  if (!wide) {
    /* rail：图标列 */
    return React.createElement('div', { className: 'sp-rail' },
      React.createElement('button', { type: 'button', className: 'sp-iconBtn', title: t('search'), 'aria-label': t('search'), onClick: openSearch },
        React.createElement(Icon, { name: 'search', size: 18 })),
      React.createElement('button', { type: 'button', className: 'sp-iconBtn', title: t('addWorkspace'), 'aria-label': t('addWorkspace'), onClick: () => { void inject.addWorkspace() } },
        React.createElement(Icon, { name: 'folder', size: 18 })),
      React.createElement('button', { type: 'button', className: 'sp-iconBtn', title: t('newSession'), 'aria-label': t('newSession'), onClick: () => inject.startSession() },
        React.createElement(Icon, { name: 'plus', size: 18 })))
  }

  let body: React.ReactElement
  if (phase !== 'ready' && totalSessions === 0) {
    body = React.createElement('div', { className: 'sp-empty' },
      React.createElement(Spinner, { size: 16 }), React.createElement('span', null, t('loading')))
  } else if (normalizedQuery !== '') {
    if (searchRows.length === 0) {
      body = React.createElement('div', { className: 'sp-empty' }, React.createElement('span', null, t('search.empty')))
    } else {
      body = React.createElement('div', { className: 'sp-list' },
        searchRows.map((row) => React.createElement(SearchRow, { key: row.id, node: row, isCurrent: row.id === current, now, t, open: inject.open })),
        remote.status === 'loading'
          ? React.createElement('div', { className: 'sp-empty', style: { padding: '12px 0' } }, React.createElement(Spinner, { size: 14 }))
          : null,
        remote.hasMore
          ? React.createElement('div', { className: 'sp-empty', style: { padding: '12px 0', fontSize: 11 } }, t('search.more'))
          : null)
    }
  } else if (totalSessions === 0) {
    body = React.createElement('div', { className: 'sp-empty' },
      React.createElement('span', null, t('empty.title')),
      React.createElement('span', { className: 'sp-emptyHint' }, t('empty.hint')))
  } else {
    body = React.createElement('div', { className: 'sp-list' },
      groups.map((g) => React.createElement(GroupSection, {
        key: g.key, group: g, expanded: !collapsed.has(g.key), now, t, current,
        open: inject.open, forkSession: inject.forkSession, archiveSession: inject.archiveSession,
        startSession: inject.startSession, onToggle: toggleGroup,
        workspaces, onCopyTo: copyTo,
        onRenameSession: (id, title) => { void inject.renameSession(id, title).catch(() => {}) },
        onWorkspaceRename: (id, title) => { void inject.renameWorkspace(id, title).catch(() => {}) },
        onWorkspaceDelete: (id) => { void inject.deleteWorkspace(id).catch(() => {}) },
      })))
  }

  return React.createElement('div', { className: 'sp-root' },
    renderHeader,
    showSearch && React.createElement('div', { className: 'sp-search', ref: searchRootRef },
      React.createElement('div', { className: 'sp-searchBox' },
        React.createElement(Icon, { name: 'search', size: 14 }),
        React.createElement('input', {
          ref: searchInputRef, className: 'sp-searchInput', value: query, placeholder: t('search.placeholder'),
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Escape') { setQuery(''); setSearchExpanded(false) } },
        }),
        normalizedQuery !== '' && React.createElement('button', {
          type: 'button', className: 'sp-clearBtn', title: t('search.clear'), 'aria-label': t('search.clear'),
          onClick: () => { setQuery(''); setSearchExpanded(false) },
        }, React.createElement(Icon, { name: 'close', size: 12 })))),
    body)
}
