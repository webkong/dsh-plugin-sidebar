<p align="center">
  <img src="assets/sidebar.png" alt="dsh-plugin-sidebar：左侧工作区/会话浏览，右侧文件与 Git 面板" width="1000" />
</p>

<p align="center">
  <b>🗂️ 为 DeepSeek Harness 而生的左右侧栏</b><br />
  左侧 · 工作区/会话浏览 —— 右侧 · 文件 + Git 面板
</p>

<p align="center">
  <a href="#-功能亮点">功能亮点</a> ·
  <a href="#-安装">安装</a> ·
  <a href="#-开发">开发</a> ·
  <a href="#-架构">架构</a> ·
  <a href="#-许可证">许可证</a> ·
  <a href="README.en.md">English</a>
</p>

---

> 🌐 **English**: 见 [README.en.md](README.en.md) · 简体中文见本文件

# dsh-plugin-sidebar

让 DeepSeek Harness 的**会话管理第一次像 IDE 一样顺手**。

左侧栏按工作区浏览全部会话（状态点、分组、搜索、一键操作），右侧栏在会话内就地浏览文件、检视 Git 变更、提交、切分支——装完即用，风格跟随 DSH 主题自动适配浅色/深色。

## ✨ 功能亮点

### 🧭 左侧栏 · 工作区/会话浏览
- **按工作区分组**：组头可折叠（文件夹图标 + 标题 + 计数 + chevron），当前会话卡片高亮
- **会话状态一眼可见**：运行中（绿色脉冲）/ 等待处理（琥珀）/ 完成 / 空闲，状态点 lane + 标题 chip
- **卡片 hover 快捷操作**：重命名（行内编辑）/ 复制 fork / 归档 / **移动到文件夹**
- **顶部搜索**：本地标题/cwd/工作区匹配 + 远端内容搜索合并（250ms 防抖），`Esc` 收起
- **组头 hover**：在此新建会话 / 重命名工作区 / 删除工作区
- **rail 窄栏模式**：侧栏折叠为图标列，点搜索/新建自动展开

### 📁 右侧栏 · 文件浏览 + Git 面板
- **会话头部右上角开关**（与会话日志下载并列），**开关状态按会话记忆**：某会话开过右栏，切走再切回仍保持打开
- **文件浏览器**：懒加载目录树（展开才拉子列表）、按文件名搜索、按内容搜索（文件/行号/行内容）、**目录 git 状态聚合徽标**（子文件最高优先级 D>M>A>R>U）
- **文件预览 tab（CodeMirror 编辑）**：主区域「对话 / 轨迹」之后新增**文件预览** tab，右侧栏点文件自动切换过去。文本文件用 **CodeMirror 6** 渲染——**语法高亮**（按扩展名自动选语言）+ **可编辑** + **保存写回磁盘**（`●` 未保存标记 + 保存按钮，头部固定始终可见）；二进制/大文件给出提示
- **Git 面板**：状态分「已暂存 / 更改」两段（`--porcelain=v1 -z` NUL 解析）、着色 diff、提交框、分支切换
- **批量操作（VSCode 源码控制风格，悬停在 section 头显示）**：`暂存全部`(+) / `取消暂存全部`(−) / `放弃全部更改`(撤销)；单文件行 hover：diff(文件) + 暂存(+)/取消暂存(−) + 放弃(撤销)
- **提交历史（VSCode 源码控制风格）**：时间线圆点 + 竖线连接、提交信息单行截断，展开显示作者·日期 + 该提交**改动文件列表**（状态字母 M/A/D 着色），文件按需懒加载

![右侧栏文件浏览器 + 文件预览 tab](assets/file-explorer.png)

![文件预览：CodeMirror 编辑 README（语法高亮 + 保存）](assets/preview-editor.png)

![右侧 Git 面板 + VSCode 风格提交历史](assets/git-panel.png)

### 🔀 会话移动到文件夹
- 复制语义（fork）：源会话保留，在目标工作区创建继承**全部已完成历史**的新会话，创建后自动打开
- 走官方 `agents.create(seed + meta.cwd)` 路径，新建的是 **agent**（生命周期归 agent 注册表，不随插件停止消失）
- 目标工作区选择浮层：`createPortal` 到 body + `position: fixed` 锚定，脱离列表 `overflow` 裁剪，靠近视口底部自动向上展开

### 🌏 为中文用户打磨
- 全中文界面 + English，跟随 DSH 语言偏好自动切换 
- 全部使用 DSH 主题 token（`--dsw-alias-*` / `--ds-*`），浅色/深色自动适配

## 📦 安装

```bash
# 从 GitHub 安装
dsh plugin --profile web add github:webkong/dsh-plugin-sidebar#main

# 或从本地路径安装（开发）
dsh plugin --profile web add /path/to/dsh-plugin-sidebar
```

重启 dsh web 后，左侧栏接管 `sidebar.workspaces`，右侧栏接管 `details` 列，会话头部出现右栏开关。

> ⚠️ 安装 / 重启后生效；Host 改动需重启 dsh web，Client 改动（`lib/client.js`）刷新页面即可。

## 🔧 开发

```bash
npm install          # 安装 esbuild / typescript（仅开发期）
npm run build        # esbuild 打包 src/ → lib/（Host ESM + Client __ModuleLoader__ bundle）
npm run typecheck    # tsc --noEmit 严格类型检查
npm test             # node --test 纯函数单元测试（42 用例）
npm run check        # typecheck + 产物语法检查 + 单元测试
```

### 结构（TypeScript 模块化）

源码为 TypeScript 模块化组织（参考官方 ui 插件结构），构建产物在 `lib/`：

```
dsh-plugin-sidebar/
├── package.json              # dsh.bundle / dsh.client 声明，scripts
├── cordis.patch.yml          # bundle patch：装载 dsp-sidebar 行
├── build.mjs                 # esbuild 构建（Host ESM + Client __ModuleLoader__ bundle）
├── tsconfig.json             # 严格类型检查（node + DOM/React）
├── lib/                      # 构建产物（已 gitignore）
│   ├── index.js              # Host 单文件 ESM bundle
│   └── client.js             # Client __ModuleLoader__ bundle
├── src/
│   ├── host/                 # Host 源码（Node 环境）
│   │   ├── index.ts          # 入口：name/inject/apply + webServer 路由注册
│   │   ├── session.ts        # 会话复制（移动到文件夹）：readSession → cut → agents.create(seed+meta.cwd)
│   │   ├── git.ts            # Git 操作：runGit + porcelain/NUL/log 解析
│   │   ├── fs.ts             # 文件系统操作：列目录 / 读文本（512KB 截断）
│   │   ├── search.ts         # 搜索：文件名递归匹配 + 内容逐行匹配
│   │   └── http.ts           # JSON 响应 / loopback 校验 / 请求体 / 参数转义
│   └── client/               # Client 源码（DOM + React 环境）
│       ├── index.ts          # apply 入口：注入样式 / 注册词典 / 注册席位
│       ├── api.ts            # /dsp-sidebar/api fetch 封装
│       ├── i18n.ts           # 中英双语词典（NS 与键类型）
│       ├── types.ts          # 契约：会话/工作区数据面 + Host API 面 + git wire 形状
│       ├── util.ts           # 共享工具：相对时间 / basename / 状态推导
│       ├── icons.tsx         # 图标（lucide 风格描边 + 右侧栏面板填充图标）
│       ├── previewStore.ts   # 文件预览共享 store（sessionId 隔离，useSyncExternalStore 订阅）
│       ├── preview/          # 主区域「文件预览」view
│       │   └── PreviewView.tsx  # conversation.view occupant：订阅 previewStore 渲染预览
│       ├── styles/           # 按组件域拆分 CSS + 聚合注入
│       │   ├── left.css      # 左侧栏样式
│       │   ├── right.css     # 右侧栏样式
│       │   ├── preview.css   # 主区域预览 tab 样式（全局 dsw token）
│       │   └── index.ts      # injectStyles（幂等注入一个 style 标签）
│       ├── left/             # 左侧栏（对齐官方 WorkspaceBrowser + rows/）
│       │   ├── derive.ts     # 数据推导：分组 / 搜索合并
│       │   ├── rows.tsx      # 行组件：SessionCard / SearchRow / GroupSection（含移动浮层 portal）
│       │   └── WorkspaceBrowser.tsx  # 主组件：标题头 + 搜索 + 列表 + rail
│       └── right/            # 右侧栏（对齐官方 RightSidebar + SourceControl + FileExplorer）
│           ├── derive.ts     # git 状态分类（badge / staged / unstaged / untracked / 目录聚合 dirBadge）
│           ├── FilesPanel.tsx   # 文件浏览器（懒加载树 + 搜索 + 预览 + git 徽标）
│           ├── GitPanel.tsx     # Git 面板（状态 / 暂存 / diff / 提交 / 时间线历史 / 分支）
│           └── RightPanel.tsx   # 面板外壳（活动条 + 标签切换）+ 头部开关
└── test/                     # 纯函数单元测试（node --test）
```

## 📡 通信契约

Host 通过 `webServer` 前缀路由 `/dsp-sidebar/api` 提供 HTTP API（仅限本机 loopback，POST + 方法名在路径末段），客户端用浏览器 `fetch` 调用：

| 方法 | 说明 |
| --- | --- |
| `fs.list` | 列目录（`{path}`） |
| `fs.read` | 读文本（512KB 截断，二进制返回 `kind:'binary'`） |
| `fs.search` | 搜索（`{mode: 'name'\|'content', path, query}`） |
| `fs.gitStatus` | 目录 git 状态映射（path → XY，供文件徽标） |
| `git.status` | git 状态（`{cwd}`） |
| `git.diff` | diff（`{cwd, path?, staged?}`） |
| `git.stage` / `git.unstage` | 暂存 / 取消暂存（`{cwd, path?}`） |
| `git.discard` | 放弃更改（`{cwd, path}`） |
| `git.commit` | 提交（`{cwd, message}`） |
| `git.log` | 提交历史（`{cwd, count?}`） |
| `git.logFiles` | 某次提交改动文件（`{cwd, hash}`，name-status 解析） |
| `git.branches` | 分支列表（`{cwd}`） |
| `git.checkout` | 切换分支（`{cwd, branch}`） |
| `session.copyTo` | 复制会话到目标工作区（`{srcId, targetPath}`）→ 返回 `{sessionId}` |

## 🏗 架构

- **Host**（`src/host/`）：经 `webServer` 注册 `/dsp-sidebar/api` 前缀路由。文件操作走挂载的 `fs` 服务（`resolve` → `listDir`/`stat`/`readText`/`readBytes`，尊重沙箱与观测策略）；Git 操作走挂载的 `shell` 服务（`resolve` + `run`，`git -C <cwd>` + porcelain/NUL 解析，与官方 bash 工具同一执行通路）
- **Client**（`src/client/`）：`fetch('/dsp-sidebar/api/...')` 调用 Host；注册席位（`sidebar.workspaces` / `details` / `conversation.session.header.utilities`）；会话复制走 `sessionQuery` / `workspaceRegistry` / `agents` 等 Host 服务（懒解析——这些服务异步激活，调用时 `ctx.get` 而非 apply 阶段缓存）

## 📄 许可证

[MIT](LICENSE)
