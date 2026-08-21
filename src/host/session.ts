// 会话复制（移动到另一文件夹）：fork 语义 —— 源会话保留，
// 在目标工作区目录创建继承全部已完成历史的新会话。
// 实现路径与官方 session.fork 一致：
//   readSession 取源事件 → 截到最后一个已完成轮次 → agents.create(seed + meta.cwd=目标) → workspace.attachSession
// 新建的是 agent（生命周期归 agent 注册表，不随插件停止而消失）。
import { randomUUID } from 'node:crypto'

/** 一次只读观察到的完整会话 log（sessionQuery.readSession 的 wire 面） */
export interface SessionSnapshot {
  session: { id: string; agentPreset?: string }
  events: Array<{ seq: number; type: string } & Record<string, unknown>>
}

/**
 * 服务解析面：copySessionTo 每次调用时经 ctx.get 懒解析服务。
 * workspaceRegistry / sessionQuery 等是异步激活服务，apply 时未必就绪，
 * 而请求处理时必然已激活 —— 故不能在 apply 阶段缓存。
 */
export interface SessionCopyCtx {
  get(name: string): unknown
}

/**
 * 复制会话到目标工作区目录。
 * @param ctx 插件上下文（调用时懒解析服务）
 * @param srcId 源会话 id
 * @param targetPath 目标目录（必须是已注册工作区的规范路径）
 * @returns 新会话 id
 */
export async function copySessionTo(ctx: SessionCopyCtx, srcId: string, targetPath: string): Promise<{ sessionId: string }> {
  const sessionQuery = ctx.get('sessionQuery') as { readSession(id: string): Promise<SessionSnapshot> } | undefined
  const workspaceRegistry = ctx.get('workspaceRegistry') as {
    resolveByPath(path: string): Promise<{ workspaceId: string; attachSession(id: string): Promise<unknown> } | undefined>
  } | undefined
  const agents = ctx.get('agents') as { create(options: Record<string, unknown>): Promise<unknown> } | undefined

  if (sessionQuery === undefined) throw new Error('会话查询服务不可用')
  if (workspaceRegistry === undefined) throw new Error('工作区注册服务不可用')
  if (agents === undefined) throw new Error('会话创建服务不可用')

  const target = await workspaceRegistry.resolveByPath(targetPath)
  if (target === undefined) throw new Error('目标文件夹未注册为工作区')

  const snapshot = await sessionQuery.readSession(srcId)
  const events = snapshot.events
  const cut = completedCut(events)
  const childId = 'session-' + randomUUID()
  const composition = await composeAgent(ctx, snapshot)
  const defaultModel = ctx.get('agentDefaultModel') as { currentSelection(): { provider: string; model: string } } | undefined
  const selection = defaultModel === undefined ? undefined : defaultModel.currentSelection()

  await agents.create({
    sessionId: childId,
    ...(cut > 0 ? { seed: events.slice(0, cut) } : {}),
    meta: {
      cwd: targetPath,
      parentSession: snapshot.session.id,
      ...(cut > 0 ? { seedLength: cut } : {}),
      ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
    },
    agentOptions: selection ?? {},
    setup: composition.setup,
  })

  try {
    await target.attachSession(childId)
  } catch (error) {
    // 会话已创建成功，仅工作区显示顺序未登记 —— 不阻断复制
    console.warn('dsh-plugin-sidebar: session ' + childId + ' created but workspace attach failed: ' + String(error))
  }
  return { sessionId: childId }
}

/**
 * 复制边界：最后一个已完成轮次（turn/end）之后、下一个 turn/start 之前的连续前缀。
 * seed 要求无 open turn / dangling tool call，故必须以此截断。空会话返回 0（建空会话）。
 */
function completedCut(events: Array<{ seq: number; type: string }>): number {
  if (events.length === 0) return 0
  const boundary = findLastTurnEnd(events)
  if (boundary === undefined) throw new Error('会话尚无已完成轮次，无法复制')
  let cut = boundary.seq + 1
  while (cut < events.length && events[cut]?.type !== 'turn/start') cut += 1
  return cut
}

function findLastTurnEnd(events: Array<{ seq: number; type: string }>): { seq: number } | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === 'turn/end') return events[index]
  }
  return undefined
}

/** 会话实际运行的 preset：最新一次 agent-preset/selected 优先，否则取创建 header 的值。 */
function resolveSessionPreset(snapshot: SessionSnapshot): string | undefined {
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const event = snapshot.events[index]
    if (event?.type === 'agent-preset/selected') return (event as { data?: { agentPreset?: string } }).data?.agentPreset
  }
  return snapshot.session.agentPreset
}

/** 与官方 composeAgent 等价：解析 preset 并返回安装 setup（无 roster 时 setup 为空）。 */
async function composeAgent(
  ctx: SessionCopyCtx,
  snapshot: SessionSnapshot,
): Promise<{ agentPreset?: string; setup: (agentCtx: unknown) => Promise<unknown> }> {
  const presets = ctx.get('agentPresets') as { resolve(id?: string): Promise<{ id: string }>; mount(agentCtx: unknown, id: string): Promise<unknown> } | undefined
  if (presets === undefined) return { setup: () => Promise.resolve() }
  const resolved = await presets.resolve(resolveSessionPreset(snapshot))
  return {
    agentPreset: resolved.id,
    // setup 返回值会被当作 AgentSetupCommit 处理（需 .commit() 函数）—— 不得透传 mount 结果
    setup: async (agentCtx) => { await presets.mount(agentCtx, resolved.id) },
  }
}
