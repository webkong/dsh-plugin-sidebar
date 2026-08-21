// 左侧行组件：会话卡片 / 搜索结果行 / 工作区分组头（对齐官方 ui-workspace rows/）
import React from 'react'
import { createPortal } from 'react-dom'
import { Icon, Spinner } from '../icons.tsx'
import { sessionStatus, pendingLabel, timeLabel } from '../util.ts'
import type { Translate } from '../i18n.ts'
import type { WorkspaceView } from '../types.ts'
import type { SessionNode, GroupNode } from './derive.ts'

export interface SessionCardActions {
  open: (id: string) => void
  forkSession: (id: string) => void
  archiveSession: (id: string) => void
}

/** 会话卡片：状态点 lane + 标题行（含状态 chip）+ 元信息行（工作区 · 相对时间）+ hover 快捷操作（含移动到文件夹） */
export function SessionCard(props: {
  node: SessionNode
  isCurrent: boolean
  now: number
  t: Translate
  actions: SessionCardActions
  onRename: (title: string) => void
  targetWorkspaces: readonly WorkspaceView[]
  onCopyTo: (id: string, workspaceId: string) => Promise<boolean>
}): React.ReactElement {
  const { node, isCurrent, now, t, actions, onRename, targetWorkspaces, onCopyTo } = props
  const s = node.session
  const [renaming, setRenaming] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [copyBusy, setCopyBusy] = React.useState(false)
  const [copyError, setCopyError] = React.useState('')
  const [anchor, setAnchor] = React.useState<{ top?: number; bottom?: number; left: number } | null>(null)
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const moveBtnRef = React.useRef<HTMLButtonElement>(null)

  /* 点击浮层外部时关闭（忽略打开按钮本身，避免 toggle 被立即收回） */
  React.useEffect(() => {
    if (!pickerOpen) return undefined
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node)) return
      if (moveBtnRef.current && moveBtnRef.current.contains(event.target)) return
      if (pickerRef.current && pickerRef.current.contains(event.target)) return
      setPickerOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [pickerOpen])

  const openPicker = (): void => {
    setCopyError('')
    const el = cardRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const left = Math.max(4, Math.min(r.left, window.innerWidth - 300))
      // 下方空间充足则向下展开，否则向上（避免浮层超出视口底部）
      if (window.innerHeight - r.bottom > 240) {
        setAnchor({ top: r.bottom + 4, left })
      } else {
        setAnchor({ bottom: window.innerHeight - r.top + 4, left })
      }
    }
    setPickerOpen((v) => !v)
  }

  const status = sessionStatus(s)
  const title = s.blank ? t('session.new') : s.displayTitle
  const pendingKind = s.pendingInteraction
  const startRename = (): void => {
    setDraft(s.displayTitle || '')
    setRenaming(true)
  }
  const commit = (): void => {
    setRenaming(false)
    const next = draft.trim()
    if (next && next !== s.displayTitle) onRename(next)
  }
  const statusLabel = pendingKind ? pendingLabel(pendingKind, t) : t('status.' + status)

  const runCopy = async (ws: WorkspaceView): Promise<void> => {
    if (copyBusy) return
    setCopyBusy(true)
    setCopyError('')
    try {
      await onCopyTo(s.id, ws.workspaceId)
      setPickerOpen(false)
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : String(error))
    } finally {
      setCopyBusy(false)
    }
  }

  return React.createElement('div', {
    className: 'sp-card',
    ref: cardRef,
    'data-active': isCurrent ? 'true' : 'false',
    onClick: () => actions.open(s.id),
    title: s.cwd || title,
  },
    React.createElement('div', { className: 'sp-status', 'data-status': status, title: statusLabel, 'aria-label': statusLabel },
      React.createElement('span', { className: 'sp-dot' })),
    React.createElement('div', { className: 'sp-cardBody' },
      renaming
        ? React.createElement('input', {
            className: 'sp-renameInput', value: draft, autoFocus: true,
            onChange: (e) => setDraft(e.target.value), onBlur: commit,
            onKeyDown: (e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(false) }
            },
            onClick: (e) => e.stopPropagation(),
          })
        : React.createElement('div', { className: 'sp-cardTitleRow' },
            React.createElement('div', { className: 'sp-cardTitle' }, title),
            pendingKind
              ? React.createElement('span', { className: 'sp-chip osb-chip-amber' }, pendingLabel(pendingKind, t))
              : status === 'running'
                ? React.createElement('span', { className: 'sp-chip osb-chip-green' }, t('status.running'))
                : null),
      React.createElement('div', { className: 'sp-cardMeta' },
        React.createElement('span', { className: 'sp-metaText' }, node.workspaceLabel || t('group.ungrouped')),
        React.createElement('span', { className: 'sp-metaTime' }, timeLabel(s.updatedAt, now, t)))),
    React.createElement('div', { className: 'sp-actions', onClick: (e: React.MouseEvent) => e.stopPropagation() },
      React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('rename'), onClick: startRename },
        React.createElement(Icon, { name: 'pencil', size: 13 })),
      s.blank ? null : React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('fork'), onClick: () => actions.forkSession(s.id) },
        React.createElement(Icon, { name: 'fork', size: 13 })),
      React.createElement('button', {
        type: 'button', ref: moveBtnRef, className: 'sp-iconBtn osb-sm', title: t('copyTo'), 'aria-label': t('copyTo'),
        onClick: openPicker,
      }, React.createElement(Icon, { name: 'move', size: 13 })),
      React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('archive'), onClick: () => actions.archiveSession(s.id) },
        React.createElement(Icon, { name: 'archive', size: 13 }))),
    pickerOpen && anchor ? createPortal(
      React.createElement('div', { className: 'sp-moveWrap', ref: pickerRef, style: { position: 'fixed', top: anchor.top, bottom: anchor.bottom, left: anchor.left } },
        React.createElement('div', { className: 'sp-movePicker' },
          React.createElement('div', { className: 'sp-moveHeader' }, t('copyTo.title')),
          targetWorkspaces.length === 0
            ? React.createElement('div', { className: 'sp-moveEmpty' }, t('copyTo.noTarget'))
            : targetWorkspaces.map((ws) => React.createElement('button', {
                key: ws.workspaceId, type: 'button', className: 'sp-moveItem', disabled: copyBusy,
                onClick: () => { void runCopy(ws) },
              },
                React.createElement(Icon, { name: 'folder', size: 13 }),
                React.createElement('span', { className: 'sp-moveItemTitle' }, ws.title),
                React.createElement('span', { className: 'sp-moveItemPath' }, ws.path),
                copyBusy ? React.createElement(Spinner, { size: 12 }) : null)),
          copyError !== '' && React.createElement('div', { className: 'sp-moveError' }, copyError))),
      document.body,
    ) : null,
  )
}

/** 搜索结果行：标题 + 工作区/摘要 + 相对时间 */
export function SearchRow(props: {
  node: SessionNode
  isCurrent: boolean
  now: number
  t: Translate
  open: (id: string) => void
}): React.ReactElement {
  const { node, isCurrent, now, t, open } = props
  return React.createElement('div', { className: 'sp-card', 'data-active': isCurrent ? 'true' : 'false', onClick: () => open(node.id) },
    React.createElement('div', { className: 'sp-cardBody' },
      React.createElement('div', { className: 'sp-cardTitleRow' },
        React.createElement('div', { className: 'sp-cardTitle' }, node.session.displayTitle)),
      React.createElement('div', { className: 'sp-cardMeta' },
        React.createElement('span', { className: 'sp-metaText' },
          node.snippet
            ? node.workspaceLabel ? node.workspaceLabel + ' · ' + node.snippet : node.snippet
            : node.workspaceLabel || t('group.ungrouped')),
        React.createElement('span', { className: 'sp-metaTime' }, timeLabel(node.session.updatedAt, now, t)))))
}

export interface GroupSectionProps {
  group: GroupNode
  expanded: boolean
  now: number
  t: Translate
  current: string | undefined
  open: (id: string) => void
  forkSession: (id: string) => void
  archiveSession: (id: string) => void
  startSession: (workspaceId?: string) => void
  onToggle: (key: string) => void
  onRenameSession: (id: string, title: string) => void
  onWorkspaceRename: (id: string, title: string) => void
  onWorkspaceDelete: (id: string) => void
  workspaces: readonly WorkspaceView[]
  onCopyTo: (id: string, workspaceId: string) => Promise<boolean>
}

/** 工作区分组：组头（chevron + 文件夹 + 标题 + 计数 + hover 操作）+ 会话卡片列表 */
export function GroupSection(props: GroupSectionProps): React.ReactElement {
  const { group, expanded, now, t, current, open, forkSession, archiveSession, startSession, onToggle, onRenameSession, onWorkspaceRename, onWorkspaceDelete, workspaces, onCopyTo } = props
  const [renaming, setRenaming] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const isUngrouped = group.workspaceId === undefined
  const label = isUngrouped ? t('group.ungrouped') : group.label
  const targetWorkspaces = workspaces.filter((ws) => ws.workspaceId !== group.workspaceId)

  const commitWorkspaceRename = (): void => {
    setRenaming(false)
    const next = draft.trim()
    if (next && next !== group.label && group.workspaceId) onWorkspaceRename(group.workspaceId, next)
  }

  const cardActions: SessionCardActions = { open, forkSession, archiveSession }

  return React.createElement('div', { style: { marginBottom: 4 } },
    React.createElement('div', {
      className: 'sp-group',
      'data-active': expanded && group.containsCurrent ? 'true' : 'false',
      onClick: () => onToggle(group.key),
      title: group.cwd || undefined,
    },
      React.createElement('span', {
        style: {
          flex: 'none', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--osb-fg-faint)', transition: 'transform .15s var(--ds-ease-in-out, ease)',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
        },
      }, React.createElement(Icon, { name: 'chevron', size: 14 })),
      React.createElement('span', { className: 'sp-groupIcon' }, React.createElement(Icon, { name: 'folder', size: 15 })),
      renaming
        ? React.createElement('input', {
            className: 'sp-renameInput', value: draft, autoFocus: true, onClick: (e) => e.stopPropagation(),
            onChange: (e) => setDraft(e.target.value), onBlur: commitWorkspaceRename,
            onKeyDown: (e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitWorkspaceRename() }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(false) }
            },
          })
        : React.createElement('div', { className: 'sp-groupTitle' }, label),
      React.createElement('span', { className: 'sp-groupCount' }, String(group.sessionCount)),
      React.createElement('div', { className: 'sp-groupActions', onClick: (e: React.MouseEvent) => e.stopPropagation() },
        isUngrouped ? null : React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('newHere'), onClick: () => startSession(group.workspaceId!) },
          React.createElement(Icon, { name: 'plus', size: 13 })),
        isUngrouped ? null : React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('rename.workspace'), onClick: () => { setDraft(group.label || ''); setRenaming(true) } },
          React.createElement(Icon, { name: 'pencil', size: 13 })),
        isUngrouped ? null : React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('delete.workspace'), onClick: () => onWorkspaceDelete(group.workspaceId!) },
          React.createElement(Icon, { name: 'trash', size: 13 })))),
    expanded && group.sessions.map((node) => React.createElement(SessionCard, {
      key: node.id, node, isCurrent: node.id === current, now, t, actions: cardActions,
      targetWorkspaces, onCopyTo,
      onRename: (title) => onRenameSession(node.id, title),
    })))
}
