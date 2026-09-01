// dsh-plugin-sidebar — Client 入口
// 注入样式、注册 locale 词典、注册三个席位：
//   sidebar.workspaces（左侧工作区/会话浏览）
//   details（右侧文件 + Git 面板）
//   sidebar.footer.action（右侧栏开关）
// Host 侧 API 经 /dsp-sidebar/api 前缀路由暴露，这里用 fetch 调用。
// 模块组织参考官方 ui 插件：入口只做装配，业务组件在 left/ 与 right/。
import React from 'react'
import { injectStyles } from './styles/index.ts'
import { NS, zh, en } from './i18n.ts'
import { call } from './api.ts'
import { WorkspaceBrowser, type LeftInject, type WorkspaceBrowserProps } from './left/WorkspaceBrowser.tsx'
import { RightPanel, RightToggle, type RightPanelProps } from './right/RightPanel.tsx'
import { FilePreviewView } from './preview/PreviewView.tsx'
import type { Translate } from './i18n.ts'

export { NS, zh, en } from './i18n.ts'

export const inject = ['slots', 'locale']

/** 组件侧 host 适配：{ call(method, payload) } 包一层 /dsp-sidebar/api fetch */
const host = {
  call: (method: string, payload?: Record<string, unknown>) => call(method, payload),
}

interface SlotReg {
  inject(key: string, cb: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

interface ClientCtx {
  get(name: string): unknown
  effect(cb: () => unknown, label?: string): unknown
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
    bind(ns: string): Translate
  }
}

export function apply(ctx: ClientCtx): void {
  injectStyles()
  ctx.effect(
    () => ctx.locale.register(NS, { zh: zh as Record<string, string>, en: en as Record<string, string> }),
    'dsh-plugin-sidebar: dictionaries',
  )
  const t = ctx.locale.bind(NS)

  const slots = ctx.get('slots') as SlotReg | undefined
  if (slots === undefined) return

  // 懒解析：layout 服务异步激活，apply 时未必就绪；每次调用时经 ctx.get 取最新实例，
  // 避免 apply 阶段缓存到 undefined 导致「右侧入口点击没反应」。
  const layout = {
    openDetails: () => (ctx.get('layout') as { openDetails(): void } | undefined)?.openDetails?.(),
    closeDetails: () => (ctx.get('layout') as { closeDetails(): void } | undefined)?.closeDetails?.(),
  }
  const leftInject = buildLeftInject(ctx)

  // 左侧：工作区/会话浏览（接管 sidebar.workspaces）
  slots.inject('sidebar.workspaces', () =>
    slots.register(
      {
        name: 'sidebar.workspaces',
        priority: -1,
        inject: () => leftInject,
      },
      (props: WorkspaceBrowserProps) => React.createElement(WorkspaceBrowser, { ...props, t, inject: leftInject }),
    ),
  )

  // 右侧：details 列（文件 + Git 面板）
  slots.inject('details', () =>
    slots.register(
      {
        name: 'details',
        priority: -1,
        inject: () => ({ closeDetails: () => { if (layout) layout.closeDetails() } }),
      },
      (props: RightPanelProps) => React.createElement(RightPanel, { ...props, t, host, layout }),
    ),
  )

  // 右侧栏开关（会话头部右上角，右对齐工具区）
  slots.inject('conversation.session.header.utilities', () =>
    slots.register(
      {
        name: 'conversation.session.header.utilities',
        id: 'right-panel-toggle',
        order: 20,
        label: () => t('open'),
      },
      (props: Record<string, unknown> & { sessionId?: string; useSessions?: <S>(sel: (s: import('./types.ts').SessionListState) => S) => S }) => React.createElement(RightToggle, {
        ...props,
        t,
        sessionId: props.sessionId,
        useSessions: props.useSessions,
        layout,
      }),
    ),
  )

  // 主区域「文件预览」tab（对话 / 轨迹之后）：右侧栏点击文件时预览出现在此
  slots.inject('conversation.view', () =>
    slots.register(
      {
        name: 'conversation.view',
        id: 'file-preview',
        order: 20,
        locale: NS,
        label: () => t('view.preview'),
      },
      (props: Record<string, unknown> & { sessionId?: string }) => React.createElement(FilePreviewView, {
        sessionId: props.sessionId,
        t,
        host,
      }),
    ),
  )
}

/** 左侧浏览区的注入动作（与会话/工作区客户端服务对接） */
export function buildLeftInject(ctx: ClientCtx): LeftInject {
  // 懒解析：sessions / workspaces / uiWorkspace / timer 均为异步激活客户端服务，apply 时可能未就绪，
  // 故每次调用时经 ctx.get 取最新实例——与 Host 侧 sessionQuery/workspaceRegistry 的懒解析策略一致，
  // 避免 apply 阶段缓存 undefined 导致「左侧添加文件夹点击没反应」。
  // 注意：dsh 0.1.2 之后 startSession / pickDirectory 从 workspaces 服务迁移到 uiWorkspace 服务，
  // create / rename / delete / archiveSession 仍在 workspaces 服务上。
  const sessionsOf = (): any => ctx.get('sessions') as any
  const workspacesOf = (): any => ctx.get('workspaces') as any
  const uiWorkspaceOf = (): any => ctx.get('uiWorkspace') as any
  const timerOf = (): any => ctx.get('timer') as any
  const inject: LeftInject = {
    open: (sessionId: string) => { const s = sessionsOf(); if (s) s.open(sessionId) },
    startSession: (workspaceId?: string) => { const uw = uiWorkspaceOf(); if (uw) uw.startSession(workspaceId) },
    searchSessions: async (query, signal) => {
      const s = sessionsOf()
      if (!s) return { items: [], hasMore: false }
      const result = await s.search(query, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    forkSession: (sessionId: string) => {
      const s = sessionsOf()
      if (!s) return
      s.fork({ sessionId, increaseTitle: true }).then((childId: string) => s.open(childId)).catch(() => {})
    },
    renameSession: async (sessionId, title) => {
      const s = sessionsOf()
      if (!s) return
      const binding = s.binding(sessionId)
      if (!binding || !binding.session) throw new Error('unknown session ' + sessionId)
      const result = await binding.session.rename(title)
      if (!result.ok) throw new Error(result.error.message)
    },
    archiveSession: async (sessionId) => { const w = workspacesOf(); if (w) await w.archiveSession(sessionId) },
    renameWorkspace: async (workspaceId, title) => { const w = workspacesOf(); if (w) await w.rename(workspaceId, title) },
    deleteWorkspace: async (workspaceId) => { const w = workspacesOf(); if (w) await w.delete(workspaceId) },
    copySessionTo: async (sessionId, workspace) => {
      const result = await call('session.copyTo', { srcId: sessionId, targetPath: workspace.path })
      return (result.result as { sessionId?: string } | undefined)?.sessionId
    },
    addWorkspace: async () => {
      const uw = uiWorkspaceOf()
      const w = workspacesOf()
      if (!uw || !w) return
      try {
        const path = await uw.pickDirectory()
        if (!path) return
        const ws = await w.create({ path })
        uw.startSession(ws.workspaceId)
      } catch (err) {
        console.error('add workspace failed', err)
      }
    },
    timeout: (fn, ms) => { const t = timerOf(); if (!t) return () => {}; return t.timeout(fn, ms) },
    get searchResultLimit() { return sessionsOf()?.searchResultLimit ?? 20 },
  }
  return inject
}
