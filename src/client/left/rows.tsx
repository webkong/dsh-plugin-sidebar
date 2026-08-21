// 左侧行组件：会话卡片 / 搜索结果行 / 工作区分组头（对齐官方 ui-workspace rows/）
import React from 'react'
import { Icon } from '../icons.tsx'
import { sessionStatus, pendingLabel, timeLabel } from '../util.ts'
import type { Translate } from '../i18n.ts'
import type { SessionNode, GroupNode } from './derive.ts'

export interface SessionCardActions {
  open: (id: string) => void
  forkSession: (id: string) => void
  archiveSession: (id: string) => void
}

/** 会话卡片：状态点 lane + 标题行（含状态 chip）+ 元信息行（工作区 · 相对时间）+ hover 快捷操作 */
export function SessionCard(props: {
  node: SessionNode
  isCurrent: boolean
  now: number
  t: Translate
  actions: SessionCardActions
  onRename: (title: string) => void
}): React.ReactElement {
  const { node, isCurrent, now, t, actions, onRename } = props
  const s = node.session
  const [renaming, setRenaming] = React.useState(false)
  const [draft, setDraft] = React.useState('')

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

  return React.createElement('div', {
    className: 'sp-card',
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
      React.createElement('button', { type: 'button', className: 'sp-iconBtn osb-sm', title: t('archive'), onClick: () => actions.archiveSession(s.id) },
        React.createElement(Icon, { name: 'archive', size: 13 }))),
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
}

/** 工作区分组：组头（chevron + 文件夹 + 标题 + 计数 + hover 操作）+ 会话卡片列表 */
export function GroupSection(props: GroupSectionProps): React.ReactElement {
  const { group, expanded, now, t, current, open, forkSession, archiveSession, startSession, onToggle, onRenameSession, onWorkspaceRename, onWorkspaceDelete } = props
  const [renaming, setRenaming] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const isUngrouped = group.workspaceId === undefined
  const label = isUngrouped ? t('group.ungrouped') : group.label

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
      onRename: (title) => onRenameSession(node.id, title),
    })))
}
