// 文件浏览器：懒加载目录树（展开目录时才向 Host 拉取子列表）+ 搜索（Names 按文件名 / Contents 按内容）
// + 文件行尾部 git 状态徽标（仅 git 仓库）。点击文件：预览写入预览 store，主区域「文件预览」tab 展示并自动切换。
// 数据经 HostApi 获取。
import React from 'react'
import { Icon, Spinner, fileTypeIcon } from '../icons.tsx'
import { baseName, errMsg } from '../util.ts'
import { badgeFromXy, badgeTitleKey, dirBadge } from './derive.ts'
import { previewStore } from '../previewStore.ts'
import type { Translate } from '../i18n.ts'
import type { HostApi, NameMatch, ContentMatch, SearchResponse } from '../types.ts'

/** fs.list 返回的条目（Host wire 形状） */
interface TreeEntry {
  name: string
  type: string
  size?: number
}

interface TreeNode {
  path: string
  /** 相对 cwd 路径（'/' 分隔）；根节点为 '' */
  rel: string
  name: string
  isDir: boolean
  /** 目录：已加载的子节点；未展开 / 未加载时为空数组 */
  children: TreeNode[]
  /** 目录加载失败信息 */
  error?: string
}

type SearchMode = 'name' | 'content'

export function FilesPanel({ cwd, sessionId, host, t }: { cwd: string | undefined; sessionId: string; host: HostApi; t: Translate }): React.ReactElement {
  const [root, setRoot] = React.useState<TreeNode | null>(null)
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set())
  const [loadingPaths, setLoadingPaths] = React.useState<Set<string>>(() => new Set())
  const [selected, setSelected] = React.useState<string | null>(null)
  const [loadingRoot, setLoadingRoot] = React.useState(false)

  /* ── git 状态映射：path(相对) → xy ── */
  const [gitMap, setGitMap] = React.useState<Record<string, string>>({})
  const [isGit, setIsGit] = React.useState(false)

  /* ── 搜索状态 ── */
  const [query, setQuery] = React.useState('')
  const [mode, setMode] = React.useState<SearchMode>('name')
  const [searching, setSearching] = React.useState(false)
  const [searchResult, setSearchResult] = React.useState<SearchResponse['result'] | null>(null)
  const [searchError, setSearchError] = React.useState<string | null>(null)
  const searchSeq = React.useRef(0)

  const loadDir = React.useCallback(async (path: string) => {
    const res = await host.call('fs.list', { path })
    if (res && res.ok) return res.entries || []
    throw new Error((res && res.error) || 'list failed')
  }, [host])

  /* 按路径向树中注入子节点（不可变更新） */
  const patchChildren = React.useCallback((node: TreeNode | null, path: string, updater: (n: TreeNode) => TreeNode): TreeNode | null => {
    if (!node) return node
    if (node.path === path) return updater(node)
    return { ...node, children: node.children.map((c) => patchChildren(c, path, updater) ?? c) }
  }, [])

  /* git 状态映射：随 cwd 变化拉取（失败静默降级为非仓库视图） */
  React.useEffect(() => {
    if (!cwd) return
    let cancelled = false
    host.call('fs.gitStatus', { cwd }).then((res) => {
      if (cancelled) return
      if (res && res.ok && res.result) {
        setIsGit(res.result.isRepo === true)
        setGitMap(res.result.map || {})
      } else {
        setIsGit(false)
        setGitMap({})
      }
    }).catch(() => {
      if (cancelled) return
      setIsGit(false)
      setGitMap({})
    })
    return () => { cancelled = true }
  }, [cwd, host])

  /* 根目录随 cwd 变化加载；根目录默认展开 */
  React.useEffect(() => {
    if (!cwd) return
    let cancelled = false
    setLoadingRoot(true)
    loadDir(cwd).then((entries) => {
      if (cancelled) return
      setRoot({ path: cwd, rel: '', name: baseName(cwd) || cwd, isDir: true, children: entries.map((e: TreeEntry) => toNode(cwd, '', e)) })
      setExpanded(new Set([cwd]))
      setLoadingRoot(false)
    }).catch((err) => {
      if (cancelled) return
      setRoot({ path: cwd, rel: '', name: baseName(cwd) || cwd, isDir: true, children: [], error: errMsg(err) })
      setExpanded(new Set([cwd]))
      setLoadingRoot(false)
    })
    return () => { cancelled = true }
  }, [cwd, loadDir])

  /* 展开目录：切换展开态，首次展开时拉取子目录 */
  const toggleDir = (path: string): void => {
    const opening = !expanded.has(path)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (opening) next.add(path); else next.delete(path)
      return next
    })
    if (!opening) return
    if (path === cwd) return
    setLoadingPaths((prev) => new Set(prev).add(path))
    loadDir(path).then((entries) => {
      setLoadingPaths((prev) => { const next = new Set(prev); next.delete(path); return next })
      setRoot((prev) => patchChildren(prev, path, (n) => ({ ...n, children: entries.map((e: TreeEntry) => toNode(path, n.rel, e)), error: undefined })))
    }).catch((err) => {
      setLoadingPaths((prev) => { const next = new Set(prev); next.delete(path); return next })
      setRoot((prev) => patchChildren(prev, path, (n) => ({ ...n, error: errMsg(err) })))
    })
  }

  const openFile = async (path: string, name: string): Promise<void> => {
    setSelected(path)
    previewStore.set(sessionId, { path, name, kind: 'loading', content: '' })
    try {
      const res = await host.call('fs.read', { path })
      if (!res || !res.ok) throw new Error((res && res.error) || 'read failed')
      previewStore.set(sessionId, { path, name, kind: res.kind === 'text' ? 'text' : res.kind, content: res.content || '', truncated: res.truncated })
    } catch (err) {
      previewStore.set(sessionId, { path, name, kind: 'error', content: errMsg(err) })
    }
    // 切到主区域「文件预览」tab（DOM 模拟点击 header 的该 tab 按钮）
    activatePreviewTab(t('view.preview'))
  }

  /* 执行搜索（防抖；序号守卫丢弃过期结果） */
  React.useEffect(() => {
    const q = query.trim()
    if (!cwd || q === '') {
      setSearchResult(null)
      setSearchError(null)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    setSearchError(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      host.call('fs.search', { path: cwd, query: q, mode }).then((res: SearchResponse | { ok: false; error: string }) => {
        if (searchSeq.current !== seq) return
        setSearching(false)
        if (res && res.ok) setSearchResult(res.result)
        else throw new Error((res as { error: string }).error || 'search failed')
      }).catch((err) => {
        if (searchSeq.current !== seq) return
        setSearching(false)
        setSearchError(errMsg(err))
      })
    }, 300)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [query, mode, cwd, host])

  const clearSearch = (): void => {
    setQuery('')
    setSearchResult(null)
    setSearchError(null)
  }

  /** 自动切换到主区域「文件预览」tab：DOM 点击 header 里 label 匹配的 tab 按钮。
   * conversation.view 的激活 API 未公开（内部 store），故按 text 定位。 */
  const activatePreviewTab = (label: string): void => {
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"]'))
      .find((b) => b.textContent === label)
    if (btn && btn.getAttribute('aria-selected') !== 'true') btn.click()
  }

  /** 文件/目录行尾部 git 徽标（仅 git 仓库且有状态时渲染；目录取其下文件聚合状态） */
  const renderGitBadge = (rel: string, isDir: boolean): React.ReactElement | null => {
    if (!isGit || rel === '') return null
    const xy = isDir ? dirBadge(gitMap, rel) : gitMap[rel]
    if (!xy) return null
    const badge = badgeFromXy(xy)
    return React.createElement('span', {
      className: 'spr-fileBadge', 'data-stage': badge,
      title: t(badgeTitleKey(xy)),
    }, badge)
  }

  const renderNode = (node: TreeNode, depth: number): React.ReactElement => {
    if (node.isDir) {
      const open = expanded.has(node.path)
      const loading = loadingPaths.has(node.path)
      const children = open ? node.children : []
      return React.createElement(React.Fragment, { key: node.path },
        React.createElement('div', { className: 'spr-row', style: { paddingLeft: 8 + depth * 14 }, onClick: () => toggleDir(node.path) },
          React.createElement('span', { className: 'spr-rowIcon', style: { transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' } },
            React.createElement(Icon, { name: 'chevron', size: 12 })),
          React.createElement('span', { className: 'spr-rowIcon', 'data-type': 'dir' }, React.createElement(Icon, { name: 'folder', size: 14 })),
          React.createElement('span', { className: 'spr-rowLabel' }, node.name),
          renderGitBadge(node.rel, true)),
        open && loading ? React.createElement('div', { className: 'spr-spinnerWrap', style: { padding: '6px 0' } }, React.createElement(Spinner, { size: 12 })) : null,
        open && node.error ? React.createElement('div', { className: 'spr-empty', style: { padding: '4px 16px', fontSize: 11, textAlign: 'left' } }, node.error) : null,
        children.map((child) => renderNode(child, depth + 1)))
    }
    return React.createElement('div', {
      key: node.path, className: 'spr-row', 'data-selected': selected === node.path ? 'true' : 'false',
      style: { paddingLeft: 8 + depth * 14 + 22 }, onClick: () => { void openFile(node.path, node.name) },
    },
      React.createElement('span', { className: 'spr-rowIcon' }, React.createElement(Icon, { name: fileTypeIcon(node.name), size: 13 })),
      React.createElement('span', { className: 'spr-rowLabel' }, node.name),
      renderGitBadge(node.rel, false))
  }

  /* 搜索结果视图 */
  const renderSearchResults = (): React.ReactElement => {
    if (searching && !searchResult) {
      return React.createElement('div', { className: 'spr-spinnerWrap' }, React.createElement(Spinner, { size: 16 }))
    }
    if (searchError) {
      return React.createElement('div', { className: 'spr-searchEmpty' }, searchError)
    }
    if (!searchResult || searchResult.matches.length === 0) {
      return React.createElement('div', { className: 'spr-searchEmpty' }, t('search.noResults'))
    }
    const matches = searchResult.matches
    if (searchResult.mode === 'name') {
      return React.createElement('div', { className: 'spr-searchResults' },
        searchResult.truncated ? React.createElement('div', { className: 'spr-searchEmpty', style: { padding: '6px 12px' } }, t('search.tooMany')) : null,
        (matches as NameMatch[]).map((m) => {
          const abs = joinCwd(cwd, m.path)
          return React.createElement('div', {
            key: m.path, className: 'spr-nameRow',
            onClick: () => { if (!m.isDir) void openFile(abs, baseName(m.path)) },
          },
            React.createElement('span', { className: 'spr-nameIcon', 'data-type': m.isDir ? 'dir' : 'file' },
              React.createElement(Icon, { name: m.isDir ? 'folder' : fileTypeIcon(m.path), size: 13 })),
            React.createElement('span', { className: 'spr-namePath', title: m.path }, m.path),
            renderGitBadge(m.path, m.isDir))
        }))
    }
    /* content 模式：按文件分组展示 */
    const byFile = new Map<string, ContentMatch[]>()
    for (const m of matches as ContentMatch[]) {
      const list = byFile.get(m.path) || []
      list.push(m)
      byFile.set(m.path, list)
    }
    return React.createElement('div', { className: 'spr-searchResults' },
      searchResult.truncated ? React.createElement('div', { className: 'spr-searchEmpty', style: { padding: '6px 12px' } }, t('search.tooMany')) : null,
      [...byFile.entries()].map(([path, lines]) => React.createElement('div', { key: path, className: 'spr-contentRow', onClick: () => { void openFile(joinCwd(cwd, path), baseName(path)) } },
        React.createElement('div', { className: 'spr-contentPath', title: path }, path),
        lines.map((m, i) => React.createElement('div', { key: i, className: 'spr-contentLine' },
          React.createElement('span', { className: 'spr-contentLineNo' }, String(m.line)),
          React.createElement('span', { className: 'spr-contentLineText' }, m.content))))))
  }

  const hasQuery = query.trim() !== ''
  const showSearchUI = hasQuery || searching || searchResult !== null || searchError !== null

  return React.createElement('div', { className: 'spr-body' },
    /* 搜索栏：搜索框 + 分段 tab（按名称 / 按内容） */
    React.createElement('div', { className: 'spr-search' },
      React.createElement('div', { className: 'spr-searchBox' },
        React.createElement(Icon, { name: 'search', size: 13 }),
        React.createElement('input', {
          className: 'spr-searchInput', value: query,
          placeholder: t('search.files.placeholder'),
          onChange: (e) => setQuery(e.target.value),
          spellCheck: false,
        }),
        searching ? React.createElement(Spinner, { size: 12 }) : null,
        hasQuery ? React.createElement('button', { type: 'button', className: 'spr-searchClear', title: t('search.clear'), 'aria-label': t('search.clear'), onClick: clearSearch },
          React.createElement(Icon, { name: 'close', size: 12 })) : null),
      React.createElement('div', { className: 'spr-modeSwitch', role: 'tablist' },
        React.createElement('button', {
          type: 'button', role: 'tab', 'aria-selected': mode === 'name',
          className: 'spr-modeBtn', 'data-active': mode === 'name' ? 'true' : 'false',
          onClick: () => setMode('name'),
        }, t('search.mode.names')),
        React.createElement('button', {
          type: 'button', role: 'tab', 'aria-selected': mode === 'content',
          className: 'spr-modeBtn', 'data-active': mode === 'content' ? 'true' : 'false',
          onClick: () => setMode('content'),
        }, t('search.mode.contents')),
      ),
    ),
    /* 搜索视图或目录树 */
    showSearchUI
      ? renderSearchResults()
      : React.createElement('div', { className: 'spr-tree' },
          loadingRoot && !root
            ? React.createElement('div', { className: 'spr-spinnerWrap' }, React.createElement(Spinner, { size: 16 }))
            : !cwd
              ? React.createElement('div', { className: 'spr-empty' }, t('empty.files'))
              : root && root.error
                ? React.createElement('div', { className: 'spr-empty' }, root.error)
                : root ? renderNode(root, 0) : null))
}

/** 拼接 cwd 与相对路径 */
function joinCwd(cwd: string | undefined, rel: string): string {
  if (!cwd) return rel
  return cwd.endsWith('/') || cwd.endsWith('\\') ? cwd + rel : cwd + '/' + rel
}

/** fs.list 条目 → 树节点（path 由父目录拼接，rel 由父节点相对路径拼接） */
function toNode(parentPath: string, parentRel: string, entry: TreeEntry): TreeNode {
  const path = parentPath.endsWith('/') || parentPath.endsWith('\\') ? parentPath + entry.name : parentPath + '/' + entry.name
  const rel = parentRel === '' ? entry.name : parentRel + '/' + entry.name
  return { path, rel, name: entry.name, isDir: entry.type === 'directory', children: [] }
}
