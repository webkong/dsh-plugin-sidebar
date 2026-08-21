// 文件系统操作：经挂载的 fs 服务（尊重沙箱与观测策略）
// 目录列出、文本读取（512KB 截断）、二进制/目录判定。

/** fs 服务的最小可用面（ctx.get('fs')） */
export interface FsService {
  resolve(path: string): Promise<{ targetKey: string; displayPath: string }>
  listDir(target: { targetKey: string; displayPath: string }): Promise<Array<{ name: string; type: string; size?: number }>>
  stat(target: { targetKey: string; displayPath: string }): Promise<{ type: string; size?: number } | undefined>
  readText(target: { targetKey: string; displayPath: string }): Promise<string>
  readBytes(target: { targetKey: string; displayPath: string }, signal: undefined, maxBytes: number): Promise<Uint8Array>
}

/** 目录条目（wire 形状） */
export interface FsEntry {
  name: string
  type: string
  size?: number
}

/** 文本读取结果 */
export interface FsTextResult {
  ok: true
  kind: 'text' | 'binary' | 'missing' | 'error'
  content: string
  truncated?: boolean
}

/** 列目录 */
export async function listDir(fs: FsService | undefined, path: string): Promise<{ ok: true; entries: FsEntry[] }> {
  if (!fs) throw new Error('fs 服务不可用')
  const target = await fs.resolve(path)
  const entries = await fs.listDir(target)
  return { ok: true, entries: entries.map((e) => ({ name: e.name, type: e.type, size: e.size })) }
}

/** 读文本（512KB 截断；二进制/目录/缺失给出对应 kind） */
export async function readText(fs: FsService | undefined, path: string): Promise<FsTextResult> {
  if (!fs) throw new Error('fs 服务不可用')
  const target = await fs.resolve(path)
  const info = await fs.stat(target)
  if (!info) return { ok: true, kind: 'missing', content: '' }
  if (info.type !== 'file') return { ok: true, kind: 'binary', content: '' }
  const cap = 512 * 1024
  // 大文件：直接读前 cap 字节并解码（不判定二进制——预览截断已足够）
  if (info.size !== undefined && info.size > cap) {
    const bytes = await fs.readBytes(target, undefined, cap)
    const text = new TextDecoder().decode(bytes)
    return { ok: true, kind: 'text', content: text, truncated: true }
  }
  // 小文件：readText 对二进制会抛错，捕获后按二进制处理
  try {
    const text = await fs.readText(target)
    return { ok: true, kind: 'text', content: text, truncated: false }
  } catch {
    return { ok: true, kind: 'binary', content: '' }
  }
}
