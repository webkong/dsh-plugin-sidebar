// 客户端契约与共享类型：会话/工作区数据面、Host API 调用面、组件 props 基元。
// 与官方 ui 插件的 contract/ 目录角色一致：类型集中定义，业务组件只消费。

/** 会话列表行（sessions 服务的最小投影） */
export interface SessionSummary {
  id: string
  displayTitle: string
  cwd?: string
  agentPreset?: string
  parentId?: string
  origin?: 'subagent'
  running: boolean
  pendingInteraction?: 'approval' | 'plan-review' | 'question'
  completed?: boolean
  blank: boolean
  updatedAt: number
}

/** 会话列表快照（useSessions 标准 prop 的数据面） */
export interface SessionListState {
  ids: string[]
  byId: Record<string, SessionSummary>
  current: string | undefined
  phase: 'pending' | 'ready'
}

/** 工作区行 */
export interface WorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

/** 工作区列表快照（useWorkspaces 标准 prop 的数据面） */
export interface WorkspaceListState {
  items: WorkspaceView[]
  archivedSessionIds: string[]
  phase: 'pending' | 'ready'
}

/** Host JSON API 调用面（组件通过它访问 /dsp-sidebar/api） */
export interface HostApi {
  call(method: string, payload?: Record<string, unknown>): Promise<any>
}

/** git 状态条目（Host wire 形状） */
export interface GitStatusEntry {
  path: string
  xy: string
}

/** git 状态快照（Host wire 形状） */
export interface GitStatusResult {
  isRepo: boolean
  branch?: string
  entries: GitStatusEntry[]
}

/** git log 行（Host wire 形状） */
export interface GitLogEntry {
  hash: string
  hashFull: string
  subject: string
  author: string
  date: string
  refs: string
}

/** 分支列表（Host wire 形状） */
export interface GitBranchesResult {
  current: string
  names: string[]
}

/** 文件名搜索命中 */
export interface NameMatch {
  path: string
  isDir: boolean
}

/** 内容搜索命中 */
export interface ContentMatch {
  path: string
  line: number
  content: string
}

/** 搜索响应（Host wire 形状） */
export interface SearchResponse {
  ok: true
  result: {
    mode: 'name' | 'content'
    matches: Array<NameMatch | ContentMatch>
    truncated: boolean
  }
}
