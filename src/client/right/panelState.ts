// 右侧栏开关状态：按会话记忆（切换会话时保持各自的开/关）
// 独立模块避免 index.ts ↔ 组件循环依赖。
const detailsBySession = new Map<string, boolean>()

/** 记录某会话的右侧栏打开意图 */
export function markDetailsOpen(sessionId: string | undefined): void {
  if (sessionId) detailsBySession.set(sessionId, true)
}

/** 记录某会话的右侧栏关闭意图 */
export function markDetailsClosed(sessionId: string | undefined): void {
  if (sessionId) detailsBySession.set(sessionId, false)
}

/** 读取某会话的右侧栏意图；无记录返回 undefined */
export function detailsIntentOf(sessionId: string | undefined): boolean | undefined {
  return sessionId ? detailsBySession.get(sessionId) : undefined
}
