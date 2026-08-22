// 主区域「文件预览」tab：conversation.view 的 occupant。
// 订阅插件内共享的 previewStore（右侧栏点击文件写入），渲染文件预览（文本/二进制/错误）。
import React from 'react'
import { Icon, Spinner } from '../icons.tsx'
import { previewStore } from '../previewStore.ts'
import type { Translate } from '../i18n.ts'

export interface FilePreviewViewProps {
  sessionId?: string
  t: Translate
}

export function FilePreviewView({ sessionId, t }: FilePreviewViewProps): React.ReactElement {
  const sid = sessionId ?? ''
  const preview = React.useSyncExternalStore(
    previewStore.subscribe,
    () => previewStore.get(sid),
    () => previewStore.get(sid),
  )
  const close = (): void => { previewStore.set(sid, null) }

  const head = React.createElement('div', { className: 'pv-head' },
    React.createElement('span', { className: 'pv-name', title: preview ? preview.path : '' }, preview ? preview.name : ''),
    preview && preview.path !== preview.name ? React.createElement('span', { className: 'pv-path', title: preview.path }, preview.path) : null,
    React.createElement('button', { type: 'button', className: 'pv-close', title: t('close'), 'aria-label': t('close'), onClick: close },
      React.createElement(Icon, { name: 'close', size: 14 })))

  const body = (() => {
    if (!preview) return React.createElement('div', { className: 'pv-empty' }, t('preview.none'))
    if (preview.kind === 'loading') {
      return React.createElement('div', { className: 'pv-loading' }, React.createElement(Spinner, { size: 16 }))
    }
    if (preview.kind === 'binary') {
      return React.createElement('div', { className: 'pv-notice' }, t('binary'))
    }
    if (preview.kind === 'error') {
      return React.createElement('div', { className: 'pv-notice' }, preview.content)
    }
    const children = [
      preview.truncated ? React.createElement('div', { className: 'pv-notice' }, t('tooLarge')) : null,
      React.createElement('pre', { className: 'pv-code' }, preview.content),
    ]
    return React.createElement(React.Fragment, null, children)
  })()

  return React.createElement('div', { className: 'pv-root' },
    body === undefined ? null : React.createElement(React.Fragment, null, head, body))
}
