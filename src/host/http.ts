// HTTP 辅助：JSON 响应、请求体读取、回环地址校验、POSIX 参数转义

/** 是否回环地址（拒绝远程访问） */
export function isLoopback(address: string | undefined): boolean {
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === 'localhost'
  )
}

/** JSON 响应 */
export function sendJson(res: { writeHead: (s: number, h: Record<string, string>) => void; end: (b: string) => void }, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** 读取请求 JSON 体（上限 maxBytes） */
export async function readBody(req: AsyncIterable<Buffer | Uint8Array>, maxBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) throw new Error('请求体过大')
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

/** POSIX 单引号转义（用于 git 参数） */
export function shq(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'"
}

/** 只含安全字符的参数直接拼接，否则单引号转义（组装 shell 命令行） */
export function shellJoin(args: readonly unknown[]): string {
  return args
    .map((a) => {
      const s = String(a)
      return /^[A-Za-z0-9_./:@-]+$/.test(s) ? s : shq(s)
    })
    .join(' ')
}
