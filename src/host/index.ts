// dsh-plugin-sidebar — Host 入口
// 经 webServer 注册 /dsp-sidebar/api 前缀路由（POST，方法名在路径末段），
// 提供 fs/git JSON API；客户端同源 fetch 调用。
// 模块组织参考官方 ui 插件：入口只做装配，业务在 git.ts / fs.ts，HTTP 细节在 http.ts。
import { isLoopback, sendJson, readBody } from './http.ts'
import * as git from './git.ts'
import * as fsOps from './fs.ts'
import * as searchOps from './search.ts'
import { copySessionTo } from './session.ts'
import type { ShellService } from './git.ts'
import type { FsService } from './fs.ts'

export const name = '@webkong/dsh-plugin-sidebar'

export const inject = ['webServer']

interface WebServer {
  register(route: { kind: string; path: string; handler: (req: any, res: any) => Promise<void> | void }): unknown
}

type ApiPayload = Record<string, unknown>

/** 各 API 方法：返回 wire 对象（{ ok, ... }）或抛错（由路由统一包装为 { ok:false }） */
interface Api {
  [method: string]: (payload: ApiPayload) => Promise<unknown>
}

export function apply(ctx: { get(name: string): unknown; effect(cb: () => unknown, label?: string): unknown }): void {
  const shell = ctx.get('shell') as ShellService | undefined
  const fs = ctx.get('fs') as FsService | undefined
  const webServer = ctx.get('webServer') as WebServer | undefined

  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const has = (v: unknown): boolean => typeof v === 'string' && v !== ''

  const api: Api = {
    'fs.list': async (p) => fsOps.listDir(fs, str(p.path)),
    'fs.read': async (p) => fsOps.readText(fs, str(p.path)),
    'fs.search': async (p) => {
      const mode = p.mode === 'content' ? 'content' : 'name'
      const root = str(p.path)
      const query = str(p.query)
      if (mode === 'content') {
        const { matches, truncated } = await searchOps.searchContent(shell, root, query)
        return { ok: true, result: { mode, matches, truncated } }
      }
      const { matches, truncated } = await searchOps.searchNames(fs, root, query)
      return { ok: true, result: { mode, matches, truncated } }
    },
    'fs.gitStatus': async (p) => ({ ok: true, result: await git.statusMap(shell, str(p.cwd)) }),
    'git.status': async (p) => ({ ok: true, result: await git.status(shell, str(p.cwd)) }),
    'git.diff': async (p) => ({ ok: true, result: await git.diff(shell, str(p.cwd), has(p.path) ? str(p.path) : undefined, p.staged === true) }),
    'git.stage': async (p) => {
      await git.stage(shell, str(p.cwd), has(p.path) ? str(p.path) : undefined)
      return { ok: true }
    },
    'git.unstage': async (p) => {
      await git.unstage(shell, str(p.cwd), has(p.path) ? str(p.path) : undefined)
      return { ok: true }
    },
    'git.discard': async (p) => {
      await git.discard(shell, str(p.cwd), str(p.path))
      return { ok: true }
    },
    'git.commit': async (p) => {
      const message = str(p.message)
      if (!message.trim()) throw new Error('提交信息不能为空')
      await git.commit(shell, str(p.cwd), message)
      return { ok: true }
    },
    'git.log': async (p) => ({ ok: true, result: await git.log(shell, str(p.cwd), Number(p.count) || 20) }),
    'git.branches': async (p) => ({ ok: true, result: await git.branches(shell, str(p.cwd)) }),
    'git.checkout': async (p) => {
      await git.checkout(shell, str(p.cwd), str(p.branch))
      return { ok: true }
    },
    'session.copyTo': async (p) => {
      const srcId = str(p.srcId)
      const targetPath = str(p.targetPath)
      if (!srcId) throw new Error('缺少源会话 id')
      if (!targetPath) throw new Error('缺少目标文件夹')
      const result = await copySessionTo(ctx, srcId, targetPath)
      return { ok: true, result }
    },
  }

  ctx.effect(() => {
    const route = {
      kind: 'prefix',
      path: '/dsp-sidebar/api',
      handler: async (req: any, res: any) => {
        if (!isLoopback(req.socket?.remoteAddress ?? '')) {
          sendJson(res, 403, { ok: false, error: '仅允许本机访问' })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        const method = pathname.startsWith('/dsp-sidebar/api/') ? pathname.slice('/dsp-sidebar/api/'.length) : undefined
        if (method === undefined || method.includes('/')) {
          sendJson(res, 404, { ok: false, error: 'unknown API method' })
          return
        }
        const handler = api[method]
        if (handler === undefined) {
          sendJson(res, 404, { ok: false, error: 'unknown API method "' + method + '"' })
          return
        }
        try {
          const payload = await readBody(req)
          sendJson(res, 200, await handler(payload))
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }
    return webServer ? webServer.register(route) : undefined
  }, '@webkong/dsh-plugin-sidebar: /dsp-sidebar/api routes')

  console.log('dsh-plugin-sidebar: host ready (/dsp-sidebar/api, ' + Object.keys(api).length + ' methods)')
}
