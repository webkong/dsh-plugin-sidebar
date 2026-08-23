// Git 操作：全部经挂载的 shell 服务执行（与官方 bash 工具同一执行通路），
// 输出用机器可读格式（porcelain -z / %x1f 分隔），解析不依赖本地化或颜色配置。
import { shellJoin } from './http.ts'

/** shell 服务的最小可用面（ctx.get('shell')） */
export interface ShellService {
  resolve(request: { command: string; workdir: string; timeoutMs?: number }): unknown
  run(spec: unknown): Promise<{
    exitCode: number | null
    stdout?: { text: string }
    stderr?: { text: string }
  }>
}

/** 一条解析后的 git status 条目 */
export interface GitStatusEntry {
  path: string
  /** 两位索引/工作区状态（X Y），如 'M '、' M'、'A '、'??' */
  xy: string
}

/** Git 状态快照 */
export interface GitStatusResult {
  isRepo: boolean
  branch?: string
  entries: GitStatusEntry[]
}

/** 一条 git log 行 */
export interface GitLogEntry {
  hash: string
  hashFull: string
  subject: string
  author: string
  date: string
  refs: string
}

/** 分支列表 */
export interface GitBranchesResult {
  current: string
  names: string[]
}

/** 一次提交改动的文件（name-status 解析） */
export interface GitLogFile {
  status: string
  path: string
}

/**
 * 运行一条 git 命令；返回 stdout。非零退出抛错（stderr 文本作为 message）。
 * 每条命令都在独立的 shell 调用中执行（`git <args>`，workdir 由 executor 设定），
 * 不保留任何状态；`GIT_OPTIONAL_LOCKS` 语义由 executor 环境管理。
 */
export async function runGit(shell: ShellService | undefined, cwd: string, args: readonly unknown[], timeoutMs?: number): Promise<string> {
  if (!shell) throw new Error('shell 服务不可用')
  const spec = shell.resolve({
    command: 'git ' + shellJoin(args),
    workdir: cwd,
    timeoutMs: timeoutMs || 30000,
  })
  const result = await shell.run(spec)
  if (result.exitCode !== 0) {
    const msg = result.stderr && result.stderr.text ? result.stderr.text.trim() : 'git exited ' + String(result.exitCode)
    throw new Error(msg)
  }
  return result.stdout ? result.stdout.text : ''
}

/** 解析 porcelain v1 -z 输出；重命名/复制条目的源路径字段被跳过 */
export function parsePorcelainZ(output: string): GitStatusEntry[] {
  const tokens = output.split('\0')
  const entries: GitStatusEntry[] = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]; i += 1
    if (token === '') continue
    const xy = token.slice(0, 2)
    const path = token.slice(3)
    entries.push({ path, xy })
    if ((xy[0] === 'R' || xy[0] === 'C') && tokens[i] !== undefined && tokens[i] !== '') i += 1
  }
  return entries
}

/** 解析 log 行：%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D */
export function parseLogLines(output: string): GitLogEntry[] {
  const rows: GitLogEntry[] = []
  for (const line of output.split('\n')) {
    if (line === '') continue
    const [hash, subject, author, date, hashFull, refs] = line.split('\x1f')
    if (hash === undefined || subject === undefined) continue
    rows.push({ hash, subject, author: author || '', date: date || '', hashFull: hashFull || hash, refs: refs || '' })
  }
  return rows
}

/** 是否在 git 工作树内 */
export async function isGitRepo(shell: ShellService | undefined, cwd: string): Promise<boolean> {
  try {
    const out = await runGit(shell, cwd, ['rev-parse', '--is-inside-work-tree'])
    return out.trim() === 'true'
  } catch {
    return false
  }
}

/** 状态快照（分支 + porcelain 条目） */
export async function status(shell: ShellService | undefined, cwd: string): Promise<GitStatusResult> {
  const repo = await isGitRepo(shell, cwd)
  if (!repo) return { isRepo: false, entries: [] }
  const [branch, raw] = await Promise.all([
    runGit(shell, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD'),
    runGit(shell, cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
  ])
  return { isRepo: true, branch: branch.trim(), entries: parsePorcelainZ(raw) }
}

/**
 * 文件路径 → git 状态映射（供文件树行尾部徽标）。
 * key 为相对 cwd 的路径（'/' 分隔），value 为 porcelain XY 双字母。
 */
export async function statusMap(shell: ShellService | undefined, cwd: string): Promise<{ isRepo: boolean; map: Record<string, string> }> {
  const repo = await isGitRepo(shell, cwd)
  if (!repo) return { isRepo: false, map: {} }
  const raw = await runGit(shell, cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])
  const map: Record<string, string> = {}
  for (const e of parsePorcelainZ(raw)) {
    map[e.path] = e.xy
  }
  return { isRepo: true, map }
}

/** diff 文本（工作区或索引，可选单路径） */
export async function diff(shell: ShellService | undefined, cwd: string, path: string | undefined, staged: boolean): Promise<string> {
  const argv: unknown[] = ['diff', '--no-ext-diff', '--no-color', '-U3']
  if (staged) argv.push('--cached')
  if (path !== undefined) argv.push('--', path)
  return runGit(shell, cwd, argv)
}

/** 暂存（全量或单路径） */
export async function stage(shell: ShellService | undefined, cwd: string, path: string | undefined): Promise<void> {
  await runGit(shell, cwd, ['add', '-A', ...(path !== undefined ? ['--', path] : [])])
}

/** 取消暂存 */
export async function unstage(shell: ShellService | undefined, cwd: string, path: string | undefined): Promise<void> {
  await runGit(shell, cwd, ['reset', '-q', ...(path !== undefined ? ['--', path] : [])])
}

/** 放弃工作区更改（单路径，或全部已跟踪文件 path 省略；未跟踪文件不适用） */
export async function discard(shell: ShellService | undefined, cwd: string, path?: string): Promise<void> {
  await runGit(shell, cwd, ['checkout', '--', ...(path !== undefined ? [path] : ['.'])])
}

/** 提交暂存内容（使用用户全局 git 身份） */
export async function commit(shell: ShellService | undefined, cwd: string, message: string): Promise<void> {
  await runGit(shell, cwd, ['commit', '-m', message])
}

/** 最近提交历史（newest first） */
export async function log(shell: ShellService | undefined, cwd: string, count = 20): Promise<GitLogEntry[]> {
  const raw = await runGit(shell, cwd, [
    'log', '-n', String(count), '--decorate=short',
    '--pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D',
  ])
  return parseLogLines(raw)
}

/** 分支列表（当前分支在前） */
export async function branches(shell: ShellService | undefined, cwd: string): Promise<GitBranchesResult> {
  const current = (await runGit(shell, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'HEAD')).trim()
  const raw = await runGit(shell, cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
  const names = raw.split('\n').filter((l) => l !== '')
  return { current, names: names.includes(current) ? names : [current, ...names] }
}

/** 解析 `git log/ show --name-status` 输出：每行 `XY\tpath` 或 `R100\told\tnew` 或 `C100\told\tnew`。 */
export function parseNameStatus(output: string): GitLogFile[] {
  const files: GitLogFile[] = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const parts = trimmed.split('\t')
    if (parts.length < 2) continue
    const status = parts[0]
    if (status.length < 1) continue
    // 重命名/复制条目有三个字段：XY\told\tnew，取目标路径
    const path = (status[0] === 'R' || status[0] === 'C') ? (parts[2] ?? parts[1]) : parts[1]
    files.push({ status: status[0], path })
  }
  return files
}

/** 某次提交改动的文件列表（供历史条目展开时按需加载） */
export async function logFiles(shell: ShellService | undefined, cwd: string, hash: string): Promise<GitLogFile[]> {
  const raw = await runGit(shell, cwd, ['show', '--name-status', '--format=', '--no-color', hash])
  return parseNameStatus(raw)
}

/** 某次提交中某文件的 diff（供历史文件点击 → 预览 tab 显示变更；--format= 去掉 commit 头，只留文件 diff） */
export async function showDiff(shell: ShellService | undefined, cwd: string, hash: string, path: string): Promise<string> {
  return runGit(shell, cwd, ['show', '--no-ext-diff', '--no-color', '-U3', '--format=', hash, '--', path])
}

/** 切换分支 */
export async function checkout(shell: ShellService | undefined, cwd: string, branch: string): Promise<void> {
  await runGit(shell, cwd, ['checkout', branch])
}
