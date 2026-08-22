// Git 面板：状态列表（已暂存 / 更改两段）+ 行内暂存/取消/放弃 + 着色 diff + 提交框 + 分支切换 + 历史
// 三个 section（已暂存 / 更改 / 历史）均可折叠；提交历史行带 hash、标题与 refs（分支/标签）徽章。
// 数据经 HostApi 获取。
import React from 'react'
import { Icon, Spinner } from '../icons.tsx'
import { timeLabel, errMsg } from '../util.ts'
import { badgeOf, isStaged, isUnstaged, isUntracked } from './derive.ts'
import type { Translate } from '../i18n.ts'
import type { HostApi, GitStatusResult, GitStatusEntry, GitLogEntry, GitLogFile, GitBranchesResult } from '../types.ts'

interface DiffState {
  name: string
  staged: boolean
  text: string
}

/** refs 装饰字符串（如 `HEAD -> main, origin/main, tag: v0.3.3`）解析为徽章列表 */
interface RefBadge {
  kind: 'branch' | 'tag' | 'head'
  label: string
}

function parseRefs(refs: string): RefBadge[] {
  if (!refs) return []
  const out: RefBadge[] = []
  for (const part of refs.split(',')) {
    const raw = part.trim()
    if (raw === '') continue
    if (raw.startsWith('tag: ')) {
      out.push({ kind: 'tag', label: raw.slice(5) })
    } else if (raw.includes(' -> ')) {
      // HEAD -> main
      const target = raw.slice(raw.indexOf(' -> ') + 4)
      out.push({ kind: 'head', label: target })
    } else {
      out.push({ kind: 'branch', label: raw })
    }
  }
  return out
}

/** 可折叠 section：标题 + 计数 + chevron 折叠按钮 */
function CollapsibleSection(props: {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactElement | null
}): React.ReactElement {
  const { title, count, collapsed, onToggle, children } = props
  return React.createElement('div', { className: 'spr-section' },
    React.createElement('div', { className: 'spr-sectionHead', onClick: onToggle },
      React.createElement('span', {
        className: 'spr-sectionChevron',
        style: { transform: collapsed ? 'rotate(-90deg)' : 'none' },
      }, React.createElement(Icon, { name: 'chevron', size: 12 })),
      React.createElement('span', { className: 'spr-sectionTitle' }, title),
      React.createElement('span', { className: 'spr-sectionCount' }, String(count))),
    collapsed ? null : React.createElement('div', { className: 'spr-sectionBody' }, children))
}

export function GitPanel({ cwd, host, t }: { cwd: string | undefined; host: HostApi; t: Translate }): React.ReactElement {
  const [status, setStatus] = React.useState<GitStatusResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState('')
  const [committing, setCommitting] = React.useState(false)
  const [log, setLog] = React.useState<GitLogEntry[]>([])
  const [diff, setDiff] = React.useState<DiffState | null>(null)
  const [branches, setBranches] = React.useState<GitBranchesResult | null>(null)
  const [busyPath, setBusyPath] = React.useState<string | null>(null)
  /* 历史展开：每条提交的可展开状态 + 懒加载的文件列表（'loading' = 加载中） */
  const [expandedLog, setExpandedLog] = React.useState<Set<string>>(() => new Set())
  const [logFiles, setLogFiles] = React.useState<Record<string, GitLogFile[] | 'loading'>>({})
  /* 三个 section 的折叠状态 */
  const [collapsed, setCollapsed] = React.useState<{ staged: boolean; changes: boolean; history: boolean }>({
    staged: false,
    changes: false,
    history: false,
  })
  const toggleSection = (key: 'staged' | 'changes' | 'history'): void => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const refresh = React.useCallback(async (): Promise<void> => {
    if (!cwd) return
    setLoading(true)
    setError(null)
    try {
      const res = await host.call('git.status', { cwd })
      if (!res || !res.ok) throw new Error((res && res.error) || 'status failed')
      setStatus(res.result)
      setDiff(null)
      if (res.result.isRepo) {
        host.call('git.log', { cwd, count: 20 }).then((lr) => { if (lr && lr.ok) setLog(lr.result || []) }).catch(() => {})
        host.call('git.branches', { cwd }).then((br) => { if (br && br.ok) setBranches(br.result) }).catch(() => {})
      } else {
        setLog([])
        setBranches(null)
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setLoading(false)
    }
  }, [cwd, host])

  React.useEffect(() => { void refresh() }, [refresh])

  const run = async (method: string, args: Record<string, unknown>): Promise<unknown> => {
    const res = await host.call(method, args)
    if (!res || !res.ok) throw new Error((res && res.error) || 'operation failed')
    return res.result
  }

  const toggleStage = async (entry: GitStatusEntry, staged: boolean): Promise<void> => {
    setBusyPath(entry.path)
    try {
      if (staged) await run('git.unstage', { cwd, path: entry.path })
      else await run('git.stage', { cwd, path: entry.path })
      await refresh()
    } catch (err) { setError(errMsg(err)) } finally { setBusyPath(null) }
  }

  const discard = async (entry: GitStatusEntry): Promise<void> => {
    setBusyPath(entry.path)
    try {
      await run('git.discard', { cwd, path: entry.path })
      await refresh()
    } catch (err) { setError(errMsg(err)) } finally { setBusyPath(null) }
  }

  const doCommit = async (): Promise<void> => {
    const msg = message.trim()
    if (!msg) return
    if (stagedEntries.length === 0) {
      setError(t('commit.nothingToCommit'))
      return
    }
    setCommitting(true)
    setError(null)
    try {
      await run('git.commit', { cwd, message: msg })
      setMessage('')
      await refresh()
    } catch (err) { setError(errMsg(err)) } finally { setCommitting(false) }
  }

  const viewDiff = async (entry: GitStatusEntry, staged: boolean): Promise<void> => {
    try {
      const res = await host.call('git.diff', { cwd, path: entry.path, staged })
      if (!res || !res.ok) throw new Error((res && res.error) || 'diff failed')
      setDiff({ name: entry.path, staged, text: res.result || '' })
    } catch (err) { setError(errMsg(err)) }
  }

  const switchBranch = async (name: string): Promise<void> => {
    try {
      await run('git.checkout', { cwd, branch: name })
      await refresh()
    } catch (err) { setError(errMsg(err)) }
  }

  const stagedEntries = status && status.isRepo ? status.entries.filter(isStaged) : []
  const unstagedEntries = status && status.isRepo ? status.entries.filter(isUnstaged) : []

  const renderFileRow = (entry: GitStatusEntry, staged: boolean): React.ReactElement => {
    const badge = badgeOf(entry)
    const busy = busyPath === entry.path
    return React.createElement('div', { key: entry.path, className: 'spr-fileRow' },
      React.createElement('span', { className: 'spr-fileBadge', 'data-stage': badge }, badge),
      React.createElement('span', { className: 'spr-fileName', title: entry.path }, entry.path),
      React.createElement('div', { className: 'spr-fileActions' },
        React.createElement('button', { type: 'button', className: 'spr-iconBtn', title: staged ? t('unstage') : t('stage'), disabled: busy, onClick: () => { void toggleStage(entry, staged) } },
          React.createElement(Icon, { name: staged ? 'close' : 'check', size: 12 })),
        isUntracked(entry) ? null : React.createElement('button', { type: 'button', className: 'spr-iconBtn', title: t('diff.' + (staged ? 'staged' : 'worktree')), disabled: busy, onClick: () => { void viewDiff(entry, staged) } },
          React.createElement(Icon, { name: 'file', size: 12 })),
        isUntracked(entry) ? null : React.createElement('button', { type: 'button', className: 'spr-iconBtn', title: t('discard'), disabled: busy, onClick: () => { void discard(entry) } },
          React.createElement(Icon, { name: 'close', size: 12 }))))
  }

  const renderDiff = (d: DiffState): React.ReactElement => {
    const lines = (d.text || '').split('\n')
    return React.createElement('div', { className: 'spr-diff' },
      React.createElement('div', { className: 'spr-diffHead' },
        React.createElement('span', { className: 'spr-diffName' }, d.staged ? t('diff.staged') + ': ' : '', d.name),
        React.createElement('button', { type: 'button', className: 'spr-iconBtn', title: t('close'), onClick: () => setDiff(null) },
          React.createElement(Icon, { name: 'close', size: 13 }))),
      React.createElement('pre', { className: 'spr-diffBody' },
        lines.map((line, i) => {
          const cls = line.startsWith('+') ? 'spr-diffAdd' : line.startsWith('-') ? 'spr-diffDel'
            : line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') ? 'spr-diffMeta' : ''
          return React.createElement('span', { key: i, className: cls }, line + '\n')
        })))
  }

  /* 展开/收起某次提交；首次展开时按需懒加载该提交改动的文件 */
  const toggleLog = (hash: string): void => {
    setExpandedLog((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) {
        next.delete(hash)
        return next
      }
      next.add(hash)
      if (!(hash in logFiles)) {
        setLogFiles((lf) => ({ ...lf, [hash]: 'loading' }))
        host.call('git.logFiles', { cwd, hash }).then((res) => {
          setLogFiles((lf) => ({ ...lf, [hash]: res && res.ok ? res.result || [] : [] }))
        }).catch(() => setLogFiles((lf) => ({ ...lf, [hash]: [] })))
      }
      return next
    })
  }

  /* 提交历史行：时间线节点（圆点 + 竖线）+ 提交信息 + 展开后作者·日期 + 文件改动列表 */
  const renderLogRow = (row: GitLogEntry, index: number, total: number): React.ReactElement => {
    const refs = parseRefs(row.refs)
    const id = row.hashFull || row.hash
    const open = expandedLog.has(id)
    const files = logFiles[id]
    const isLast = index === total - 1
    return React.createElement('div', { key: id, className: 'spr-logRow', 'data-last': isLast ? 'true' : 'false' },
      React.createElement('div', { className: 'spr-logTop', onClick: () => toggleLog(id) },
        React.createElement('span', { className: 'spr-logNode' }),
        React.createElement('span', { className: 'spr-logChevron', style: { transform: open ? 'rotate(90deg)' : 'none' } },
          React.createElement(Icon, { name: 'chevron', size: 12 })),
        React.createElement('span', { className: 'spr-logSubject', title: row.subject }, row.subject),
        refs.length > 0
          ? React.createElement('span', { className: 'spr-logRefs' },
              refs.map((r) => React.createElement('span', { key: r.label, className: 'spr-logRef', 'data-kind': r.kind }, r.label)))
          : null),
      open ? React.createElement('div', { className: 'spr-logDetail' },
        React.createElement('div', { className: 'spr-logMeta' }, row.author + ' · ' + timeLabel(new Date(row.date).getTime(), Date.now(), t)),
        files === 'loading'
          ? React.createElement('div', { className: 'spr-logLoading' }, React.createElement(Spinner, { size: 12 }))
          : files && files.length > 0
            ? React.createElement('div', { className: 'spr-logFiles' },
                files.map((f) => React.createElement('div', { key: f.path, className: 'spr-logFile' },
                  React.createElement('span', { className: 'spr-fileBadge', 'data-stage': f.status }, f.status),
                  React.createElement('span', { className: 'spr-fileName', title: f.path }, f.path))))
            : React.createElement('div', { className: 'spr-logMeta' }, t('noChanges')))
        : null)
  }

  return React.createElement('div', { className: 'spr-git' },
    React.createElement('div', { className: 'spr-gitHead' },
      React.createElement('span', { className: 'spr-branch' },
        React.createElement(Icon, { name: 'branch', size: 12 }),
        React.createElement('span', { className: 'spr-branchName' }, status && status.isRepo ? status.branch : '—')),
      React.createElement('div', { style: { flex: 1 } }),
      React.createElement('button', { type: 'button', className: 'spr-iconBtn', title: t('refresh'), disabled: loading, onClick: () => { void refresh() } },
        React.createElement(Icon, { name: 'refresh', size: 14 }))),
    React.createElement('div', { className: 'spr-gitBody' },
      loading && !status
        ? React.createElement('div', { className: 'spr-spinnerWrap' }, React.createElement(Spinner, { size: 16 }))
        : !status || !status.isRepo
          ? React.createElement('div', { className: 'spr-empty' }, t('empty.notRepo'))
          : React.createElement(React.Fragment, null,
              error ? React.createElement('div', { className: 'spr-empty', style: { color: 'var(--spr-red)', padding: '8px 12px', fontSize: 12 } }, error) : null,
              branches && branches.names.length > 1
                ? React.createElement('div', { style: { padding: '8px 10px 0', display: 'flex', flexWrap: 'wrap', gap: 4 } },
                    branches.names.filter((n) => n !== branches.current).slice(0, 4).map((n) => React.createElement('button', {
                      key: n, type: 'button', className: 'spr-tab', style: { height: 22, fontSize: 11 }, onClick: () => { void switchBranch(n) },
                    }, n)))
                : null,
              React.createElement(CollapsibleSection, {
                title: t('staged'), count: stagedEntries.length,
                collapsed: collapsed.staged, onToggle: () => toggleSection('staged'),
                children: stagedEntries.length === 0
                  ? React.createElement('div', { className: 'spr-noChanges' }, t('noChanges'))
                  : React.createElement(React.Fragment, null, stagedEntries.map((e) => renderFileRow(e, true))),
              }),
              React.createElement(CollapsibleSection, {
                title: t('changes'), count: unstagedEntries.length,
                collapsed: collapsed.changes, onToggle: () => toggleSection('changes'),
                children: unstagedEntries.length === 0
                  ? React.createElement('div', { className: 'spr-noChanges' }, t('noChanges'))
                  : React.createElement(React.Fragment, null, unstagedEntries.map((e) => renderFileRow(e, false))),
              }),
              React.createElement(CollapsibleSection, {
                title: t('history'), count: log.length,
                collapsed: collapsed.history, onToggle: () => toggleSection('history'),
                children: log.length === 0
                  ? React.createElement('div', { className: 'spr-noChanges' }, t('noChanges'))
                  : React.createElement(React.Fragment, null, log.map((row, i) => renderLogRow(row, i, log.length))),
              }),
            )),
    status && status.isRepo
      ? React.createElement('div', { className: 'spr-commitBox' },
          error ? React.createElement('div', { className: 'spr-commitError' }, error) : null,
          React.createElement('input', {
            className: 'spr-commitInput', value: message, placeholder: t('commit.placeholder'),
            onChange: (e) => setMessage(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && message.trim() && !committing) void doCommit() },
          }),
          React.createElement('button', {
            type: 'button', className: 'spr-commitBtn',
            disabled: !message.trim() || committing || stagedEntries.length === 0,
            onClick: () => { void doCommit() },
          }, committing ? t('loading') : t('commit')))
      : null,
    diff ? renderDiff(diff) : null)
}
