// 图标：lucide 风格内联 SVG（stroke currentColor），左右侧栏共用
import React from 'react'

export type IconName =
  | 'search' | 'plus' | 'close' | 'chevron' | 'folder' | 'file' | 'files'
  | 'git' | 'branch' | 'fork' | 'archive' | 'pencil' | 'trash'
  | 'refresh' | 'check' | 'panel' | 'spinner' | 'move'

const ICON_PATHS: Record<IconName, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  plus: 'M5 12h14M12 5v14',
  close: 'M18 6 6 18M6 6l12 12',
  chevron: 'm9 6 6 6-6 6',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  move: 'M2 6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2ZM12 15v-6M9 12l3-3 3 3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6',
  files: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
  git: 'M6 3v12M18 21a3 3 0 0 0 3-3v-1.5a3 3 0 0 0-3-3H9a3 3 0 0 1-3-3V6M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  branch: 'M6 3v12M18 21a3 3 0 0 0 3-3v-1.5a3 3 0 0 0-3-3H9a3 3 0 0 1-3-3V6M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  fork: 'M6 3v12M18 21a3 3 0 0 0 3-3v-1.5a3 3 0 0 0-3-3H9a3 3 0 0 1-3-3V6M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  archive: 'M21 8v13H3V8M1 3h22v5H1ZM10 12h4',
  pencil: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  check: 'M20 6 9 17l-5-5',
  panel: 'M21 3H3v18h18ZM9 3v18',
  spinner: 'M21 12a9 9 0 1 1-6.219-8.56',
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): React.ReactElement {
  const path = ICON_PATHS[name]
  if (!path) return React.createElement('span')
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }, React.createElement('path', { d: path }))
}

export function Spinner({ size = 14 }: { size?: number }): React.ReactElement {
  return React.createElement('span', { style: { display: 'inline-flex' } },
    React.createElement('svg', {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      style: { animation: 'sp-spin .8s linear infinite' },
    }, React.createElement('path', { d: ICON_PATHS.spinner })))
}

/** 右侧栏开关图标：填充风格面板（16x16，fill currentColor，与原稿逐点一致） */
const PANEL_GLYPH_PATH =
  'M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z'

export function PanelGlyph({ size = 16 }: { size?: number }): React.ReactElement {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': true,
    style: { transform: 'rotate(180deg)' },
  }, React.createElement('path', {
    'fill-rule': 'evenodd',
    'clip-rule': 'evenodd',
    d: PANEL_GLYPH_PATH,
    fill: 'currentColor',
  }))
}
