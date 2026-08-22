// 主区域「文件预览」tab：conversation.view 的 occupant。
// 订阅插件内共享的 previewStore（右侧栏点击文件写入），用 CodeMirror 6 渲染可编辑、带语法高亮的预览，
// 支持保存写回磁盘（host.call('fs.write')）。布局带左右边距，跟随 DSH 主题。
import React from 'react'
import { Icon, Spinner } from '../icons.tsx'
import { previewStore } from '../previewStore.ts'
import { errMsg } from '../util.ts'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { xml } from '@codemirror/lang-xml'
import type { Translate } from '../i18n.ts'

export interface FilePreviewViewProps {
  sessionId?: string
  t: Translate
  host?: { call(method: string, payload?: Record<string, unknown>): Promise<unknown> }
}

/** 按文件扩展名选择 CodeMirror 语言；未知返回 []（无高亮纯文本） */
function langFor(name: string): Extension {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'js': case 'jsx': case 'mjs': case 'cjs': return javascript()
    case 'ts': case 'tsx': return javascript({ typescript: true })
    case 'json': return json()
    case 'py': return python()
    case 'md': case 'markdown': return markdown()
    case 'html': case 'htm': case 'vue': return html()
    case 'css': case 'scss': case 'less': return css()
    case 'xml': case 'svg': return xml()
    default: return []
  }
}

export function FilePreviewView({ sessionId, t, host }: FilePreviewViewProps): React.ReactElement {
  const sid = sessionId ?? ''
  const preview = React.useSyncExternalStore(
    previewStore.subscribe,
    () => previewStore.get(sid),
    () => previewStore.get(sid),
  )
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')
  const editorHostRef = React.useRef<HTMLDivElement>(null)
  const viewRef = React.useRef<EditorView | null>(null)

  /* 挂载/重建 CodeMirror：仅在切文件（path）或加载态变化（kind）时重建，编辑不触发 */
  React.useEffect(() => {
    const el = editorHostRef.current
    if (!el || !preview || preview.kind !== 'text') {
      viewRef.current?.destroy()
      viewRef.current = null
      return
    }
    const content = preview.content
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          langFor(preview.name),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => { if (u.docChanged) setDirty(true) }),
        ],
      }),
      parent: el,
    })
    viewRef.current = view
    setDirty(false)
    setSaveError('')
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.path, preview?.kind])

  const close = (): void => { previewStore.set(sid, null) }

  const save = async (): Promise<void> => {
    const view = viewRef.current
    const content = view ? view.state.doc.toString() : ''
    if (!content || !preview || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await host?.call('fs.write', { path: preview.path, content })
      setDirty(false)
    } catch (err) {
      setSaveError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  const isText = preview != null && preview.kind === 'text'

  return React.createElement('div', { className: 'pv-root' },
    !preview
      ? React.createElement('div', { className: 'pv-empty' }, t('preview.none'))
      : React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'pv-head' },
            React.createElement('span', { className: 'pv-name', title: preview.path }, preview.name),
            preview.path !== preview.name ? React.createElement('span', { className: 'pv-path', title: preview.path }, preview.path) : null,
            dirty ? React.createElement('span', { className: 'pv-dirty', title: t('dirty') }, '●') : null,
            isText ? React.createElement('button', {
              type: 'button', className: 'pv-save', disabled: !dirty || saving,
              title: dirty ? (saving ? t('saving') : t('save')) : t('saved'),
              onClick: () => { void save() },
            }, saving ? t('saving') : t('save')) : null,
            React.createElement('button', { type: 'button', className: 'pv-close', title: t('close'), 'aria-label': t('close'), onClick: close },
              React.createElement(Icon, { name: 'close', size: 14 }))),
          React.createElement('div', { className: 'pv-body' },
            preview.kind === 'loading'
              ? React.createElement('div', { className: 'pv-loading' }, React.createElement(Spinner, { size: 16 }))
              : preview.kind === 'binary'
                ? React.createElement('div', { className: 'pv-notice' }, t('binary'))
                : preview.kind === 'error'
                  ? React.createElement('div', { className: 'pv-notice' }, preview.content)
                  : React.createElement(React.Fragment, null,
                      saveError ? React.createElement('div', { className: 'pv-notice', 'data-error': true }, saveError) : null,
                      React.createElement('div', { className: 'pv-editor', ref: editorHostRef })))))
}
