// 右侧面板外壳：顶部活动条（文件 / Git 标签 + 关闭）+ 面板切换
// 会话 cwd 来自 useSessions 标准 prop；右侧栏开关状态按会话记忆（切换会话保持各自开/关）。
import React from 'react'
import { Icon, PanelGlyph } from '../icons.tsx'
import { FilesPanel } from './FilesPanel.tsx'
import { GitPanel } from './GitPanel.tsx'
import { markDetailsOpen, markDetailsClosed, detailsIntentOf } from './panelState.ts'
import type { Translate } from '../i18n.ts'
import type { HostApi, SessionListState } from '../types.ts'

export interface RightPanelProps {
  sessionId: string
  useSessions: <S>(sel: (s: SessionListState) => S) => S
  closeDetails: () => void
  t: Translate
  host: HostApi
  layout?: { openDetails(): void; closeDetails(): void }
}

export function RightPanel(props: RightPanelProps): React.ReactElement {
  const { sessionId, useSessions, closeDetails, t, host, layout } = props
  const cwd = useSessions((s) => s.byId[sessionId] && s.byId[sessionId].cwd)
  const [tab, setTab] = React.useState<'files' | 'git'>('files')

  return React.createElement('div', { className: 'spr-root' },
    React.createElement('div', { className: 'spr-topbar' },
      React.createElement('button', { type: 'button', className: 'spr-tab', 'data-active': tab === 'files' ? 'true' : 'false', onClick: () => setTab('files') },
        React.createElement(Icon, { name: 'files', size: 14 }), t('files')),
      React.createElement('button', { type: 'button', className: 'spr-tab', 'data-active': tab === 'git' ? 'true' : 'false', onClick: () => setTab('git') },
        React.createElement(Icon, { name: 'git', size: 14 }), t('git')),
      React.createElement('div', { className: 'spr-tabSpacer' }),
      React.createElement('button', { type: 'button', className: 'spr-iconBtn', title: t('close'), 'aria-label': t('close'), onClick: () => { markDetailsClosed(sessionId); closeDetails() } },
        React.createElement(Icon, { name: 'close', size: 15 }))),
    tab === 'files'
      ? React.createElement(FilesPanel, { cwd, sessionId, host, t })
      : React.createElement(GitPanel, { cwd, sessionId, host, t }))
}

/** 头部开关：展开/收起右侧栏；随会话切换自动对齐该会话的记忆状态 */
export function RightToggle(props: {
  t: Translate
  sessionId?: string
  useSessions?: <S>(sel: (s: SessionListState) => S) => S
  layout?: { openDetails(): void; closeDetails(): void }
}): React.ReactElement {
  const { t, sessionId, useSessions, layout } = props

  /* 监听当前会话变化：切换会话时按该会话的记忆意图对齐右栏开/关。
   * 头部开关总是渲染（不依赖 details 列是否打开），因此即使目标会话右栏
   * 关闭中也能正确恢复——这是"保持状态"的关键监听点。
   * 意图为 true → 打开；false 或从未操作过 → 关闭（只有明确打开过的会话才开）。 */
  const current = useSessions ? useSessions((s) => s.current) : undefined
  React.useEffect(() => {
    if (!layout || !current) return
    if (detailsIntentOf(current) === true) {
      layout.openDetails()
    } else {
      layout.closeDetails()
    }
  }, [current, layout])

  /* 开关按钮：按当前会话记忆状态取反（开↔关） */
  const onClick = (): void => {
    if (!layout) return
    const target = sessionId || current
    if (!target) return
    const currentIntent = detailsIntentOf(target)
    if (currentIntent === true) {
      markDetailsClosed(target)
      layout.closeDetails()
    } else {
      markDetailsOpen(target)
      layout.openDetails()
    }
  }
  return React.createElement('button', {
    type: 'button', className: 'spr-toggle', title: t('open'), 'aria-label': t('open'), onClick,
  }, React.createElement(PanelGlyph, { size: 16 }))
}
