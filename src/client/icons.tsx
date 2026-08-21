// 图标：lucide 风格内联 SVG（stroke currentColor），左右侧栏共用
import React from 'react'

export type IconName =
  | 'search' | 'plus' | 'close' | 'chevron' | 'folder' | 'file' | 'files'
  | 'git' | 'branch' | 'fork' | 'archive' | 'pencil' | 'trash'
  | 'refresh' | 'check' | 'panel' | 'spinner'

const ICON_PATHS: Record<IconName, string> = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  plus: 'M5 12h14M12 5v14',
  close: 'M18 6 6 18M6 6l12 12',
  chevron: 'm9 6 6 6-6 6',
  folder: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
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
