// 文件预览共享 store：按会话隔离的文件预览状态。
// 右侧栏 FilesPanel 点击文件、Git 面板点击提交文件（diff）时写入；
// 主区域 conversation.view 的「预览」tab 订阅读取。
// 两侧同处一个插件 bundle，直接共享模块级状态 + useSyncExternalStore。
export interface PreviewData {
  path: string
  name: string
  kind: 'loading' | 'text' | 'binary' | 'error'
  content: string
  truncated?: boolean
  /** 预览类型：file=普通文件（可编辑），diff=提交的变更（只读 diff 高亮） */
  mode?: 'file' | 'diff'
}

const state = new Map<string, PreviewData | null>()
const listeners = new Set<() => void>()
let version = 0

export const previewStore = {
  /** 写入某会话的预览状态（null = 无预览/清空） */
  set(sessionId: string, data: PreviewData | null): void {
    state.set(sessionId, data)
    version += 1
    for (const fn of listeners) fn()
  },
  /** 读取某会话的预览状态 */
  get(sessionId: string): PreviewData | null {
    return state.get(sessionId) ?? null
  },
  /** 外部 store 订阅（供 useSyncExternalStore） */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  /** 版本号（useSyncExternalStore 变化检测） */
  getVersion(): number {
    return version
  },
}
