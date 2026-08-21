// 搜索：文件名递归匹配 + 文件内容逐行匹配
// 文件名搜索：经 fs 服务递归遍历（大小写不敏感子串匹配）；
// 内容搜索：优先 ripgrep（rg），回退 grep -r；解析 `path:line:content` 行。
import type { ShellService } from './git.ts'
import type { FsService } from './fs.ts'

/** 一条内容匹配 */
export interface ContentMatch {
  /** 相对搜索根路径（'/' 分隔） */
  path: string
  /** 1 起始行号 */
  line: number
  /** 该行文本（去尾换行） */
  content: string
}

/** 文件名搜索结果 */
export interface NameMatch {
  path: string
  isDir: boolean
}

/** 默认预算：最大命中数与最大遍历条目数（防失控） */
const DEFAULT_MAX_MATCHES = 200
const DEFAULT_MAX_VISITED = 100_000

/**
 * 文件名搜索：递归遍历 root，返回名字含 query（大小写不敏感）的条目相对路径。
 * 跳过 .git；不追符号链接目录（防环）；不可读目录跳过；超预算提前截断。
 * @param fs - 挂载的 fs 服务。
 * @param root - 搜索根（绝对路径）。
 */
export async function searchNames(fs: FsService | undefined, root: string, query: string, opts: { maxMatches?: number; maxVisited?: number } = {}): Promise<{ matches: NameMatch[]; truncated: boolean }> {
  if (!fs) throw new Error('fs 服务不可用')
  const needle = query.trim().toLowerCase()
  if (needle === '') return { matches: [], truncated: false }
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES
  const maxVisited = opts.maxVisited ?? DEFAULT_MAX_VISITED
  const matches: NameMatch[] = []
  let visited = 0
  let truncated = false

  const walk = async (dir: string): Promise<void> => {
    if (truncated) return
    const entries = await listLevel(fs, dir)
    if (entries === undefined) return
    for (const entry of entries) {
      visited += 1
      if (visited > maxVisited) { truncated = true; return }
      if (entry.isDir && entry.name === '.git') continue
      const rel = relativePath(root, dir, entry.name)
      if (entry.name.toLowerCase().includes(needle)) {
        matches.push({ path: rel, isDir: entry.isDir })
        if (matches.length >= maxMatches) { truncated = true; return }
      }
      if (entry.isDir && !entry.isSymlink) {
        await walk(joinPath(dir, entry.name))
        if (truncated) return
      }
    }
  }
  await walk(root)
  matches.sort((a, b) => (a.path < b.path ? -1 : 1))
  return { matches, truncated }
}

/**
 * 内容搜索：rg -n 或 grep -rn 匹配行。
 * 排除二进制文件（rg 默认）与 .git/node_modules；不可执行时抛出（由调用方转 ok:false）。
 * @param shell - 挂载的 shell 服务。
 * @param root - 搜索根（绝对路径）。
 * @param query - 查询串（按普通文本传给 rg，自动转义为正则字面量）。
 */
export async function searchContent(shell: ShellService | undefined, root: string, query: string, opts: { maxResults?: number } = {}): Promise<{ matches: ContentMatch[]; truncated: boolean }> {
  const q = query.trim()
  if (q === '') return { matches: [], truncated: false }
  if (!shell) throw new Error('shell 服务不可用')
  const maxResults = opts.maxResults ?? DEFAULT_MAX_MATCHES
  const limit = String(maxResults)
  const needle = quoteForShell(q)
  // rg 优先；--fixed-strings 将查询视为字面量；--no-heading 输出 path:line:content。
  // 以 '.' 作为搜索目标并在 workdir 内运行，输出即相对路径（Client 再拼 cwd）。
  const rgCmd = 'rg -n --no-heading --fixed-strings -i --max-count 500 --max-filesize 1M '
    + '--glob "!.git/**" --glob "!node_modules/**" ' + needle + ' .'
    + ' 2>/dev/null | head -n ' + limit
  const grepCmd = 'grep -rIn -m 500 -i --exclude-dir=.git --exclude-dir=node_modules '
    + needle + ' . 2>/dev/null | head -n ' + limit
  // 尝试 rg，失败回退 grep
  let out = ''
  try {
    out = await runSearch(shell, root, rgCmd)
  } catch {
    out = await runSearch(shell, root, grepCmd)
  }
  return { matches: parseSearchLines(out), truncated: false }
}

/** 执行一条搜索命令 */
async function runSearch(shell: ShellService, root: string, command: string): Promise<string> {
  const spec = shell.resolve({
    command,
    workdir: root,
    timeoutMs: 15000,
  })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    // rg/grep 无命中返回退出码 1，视为空结果
    if (result.exitCode === 1) return ''
    throw new Error(result.stderr?.text?.trim() || '搜索失败')
  }
  return result.stdout ? result.stdout.text : ''
}

/** POSIX 单引号转义（用于把查询作为字面量拼进命令行） */
function quoteForShell(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/** 解析 `path:line:content` 输出为匹配列表（剥掉 `./` 前缀） */
function parseSearchLines(output: string): ContentMatch[] {
  const matches: ContentMatch[] = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const sep = line.indexOf(':')
    if (sep <= 0) continue
    let path = line.slice(0, sep)
    if (path.startsWith('./')) path = path.slice(2)
    const rest = line.slice(sep + 1)
    const lineSep = rest.indexOf(':')
    const lineNo = Number(lineSep > 0 ? rest.slice(0, lineSep) : '0')
    const content = lineSep > 0 ? rest.slice(lineSep + 1) : rest
    matches.push({ path, line: Number.isFinite(lineNo) ? lineNo : 0, content })
  }
  return matches
}

/** 列目录（经 fs 服务；返回 undefined 表示不可读/不存在） */
async function listLevel(fs: FsService, dir: string): Promise<Array<{ name: string; isDir: boolean; isSymlink: boolean }> | undefined> {
  try {
    const target = await fs.resolve(dir)
    const entries = await fs.listDir(target)
    return entries.map((e) => ({ name: e.name, isDir: e.type === 'directory', isSymlink: false }))
  } catch {
    return undefined
  }
}

/** 相对路径（'/' 分隔） */
function relativePath(root: string, dir: string, name: string): string {
  if (dir === root) return name
  return dir.slice(root.length).replace(/[\\/]+/g, '/').replace(/^\/+/, '') + '/' + name
}

/** 路径拼接（保留原始分隔符） */
function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + '/' + name
}
