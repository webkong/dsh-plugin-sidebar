// 浏览器侧 HTTP 调用：webServer /dsp-sidebar/api 前缀路由（同源 fetch）
export class SidebarApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** 调用一个 /dsp-sidebar/api 方法；返回业务对象（{ ok, ... }）。 */
export async function call(method: string, payload?: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
  let response: Response
  try {
    response = await fetch('/dsp-sidebar/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    throw new SidebarApiError('network', error instanceof Error ? error.message : String(error))
  }
  let data: any = null
  try {
    data = await response.json()
  } catch { /* 非 JSON 响应 */ }
  if (!response.ok || data === null || data.ok !== true) {
    throw new SidebarApiError(
      data !== null && typeof data.error === 'string' ? 'api' : 'http',
      data !== null && typeof data.error === 'string' ? data.error : 'HTTP ' + response.status,
    )
  }
  return data
}
