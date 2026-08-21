// 构建：Host (src/host → lib/index.js, ESM) + Client (src/client → lib/client.js, __ModuleLoader__ bundle)
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

const shared = {
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  minify: false,
  loader: { '.css': 'text' },
}

// 1) Host：ESM，Node 平台；webServer/shell/fs 都经 ctx.get 获取，无外部 import。
const hostResult = await build({
  ...shared,
  entryPoints: ['src/host/index.ts'],
  format: 'esm',
  platform: 'node',
  write: false,
})
writeFileSync('lib/index.js', hostResult.outputFiles[0].text)
console.log(`built lib/index.js (${hostResult.outputFiles[0].text.length} bytes)`)

// 2) Client：CJS + external react，包进 __ModuleLoader__.load
const clientResult = await build({
  ...shared,
  entryPoints: ['src/client/index.ts'],
  format: 'cjs',
  platform: 'browser',
  external: ['react', 'react-dom'],
  write: false,
})
const wrapped = `window.__ModuleLoader__.load({
  id: '@webkong/dsh-plugin-sidebar',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
${clientResult.outputFiles[0].text}
    return module.exports;
  },
});
`
writeFileSync('lib/client.js', wrapped)
console.log(`built lib/client.js (${wrapped.length} bytes)`)
