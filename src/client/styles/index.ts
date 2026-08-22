// 样式聚合：按组件域拆分（left.css / right.css / preview.css），运行期合并注入一个 style 标签。
import leftCss from './left.css'
import rightCss from './right.css'
import previewCss from './preview.css'

export const CSS = leftCss + '\n' + rightCss + '\n' + previewCss

const STYLE_ID = 'dsh-plugin-sidebar/panel.css'

/** 注入本插件的样式表（幂等；同一 style 标签只插入一次） */
export function injectStyles(): void {
  if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-plugin-sidebar'
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}
