# dsh-plugin-sidebar

DSH 左右侧栏插件，单包内置 Host + Client 两个半区。源码为 TypeScript 模块化组织（参考官方 ui 插件结构），构建产物在 `lib/`。

## 功能

**左侧栏（`sidebar.workspaces`）** — 工作区/会话浏览
- 会话卡片：状态点 lane（运行=绿色脉冲 / 等待=琥珀 / 完成=绿 / 空闲=灰）
- 按工作区分组，组头可折叠（文件夹图标 + 标题 + 计数 + chevron）
- 当前会话卡片高亮（边框 + 背景洗 + 阴影）
- 卡片 hover 快捷操作：重命名（行内编辑）/ 复制 fork / 归档
- 顶部搜索：本地标题/cwd/工作区匹配 + 远端内容搜索合并（250ms 防抖）
- 组头 hover：在此新建会话 / 重命名工作区 / 删除工作区
- rail 窄栏模式（侧栏折叠为图标列）

**右侧栏（`details` 列 + 会话头部开关）** — 文件浏览 + Git 面板
- 会话头部右上角开关（`conversation.session.header.utilities`，与会话日志下载按钮并列）
  - **开关状态按会话记忆**：某会话打开过右栏，切走再切回仍保持打开；其他会话默认关闭
- 顶部活动条：文件 / Git 标签 + 关闭按钮
- 文件浏览器：
  - 懒加载目录树（展开目录时才向 Host 拉取子列表）
  - **搜索文件名**：Names 模式，递归匹配文件名（大小写不敏感，`.git` 跳过，预算上限防失控）
  - **搜索文件内容**：Contents 模式，逐行匹配并展示 文件/行号/行内容
  - 点击文件底部预览（文本 512KB 截断 / 二进制提示）
- Git 面板：状态分「已暂存 / 更改」两段（`--porcelain=v1 -z` NUL 解析）、行内暂存/取消/放弃、着色 diff、提交框、分支切换、提交历史

## 安装

本地路径或已发布 npm 包均可：

```bash
dsh plugin --profile <name> add @webkong/dsh-plugin-sidebar@0.1.0
```

或手动在 profile 的 `cordis.patch.yml` 中插入：

```yaml
- insert:
    - id: dsp-sidebar
      name: '@webkong/dsh-plugin-sidebar'
```

## 构建与检查

```bash
npm install            # 安装 esbuild / typescript（仅开发期）
npm run build          # src/ → lib/（Host ESM + Client __ModuleLoader__ bundle）
npm run typecheck      # tsc --noEmit
npm test               # 纯函数单元测试（node:test，Node 24 type stripping 直接跑 test/*.test.ts）
npm run check          # 类型检查 + 产物语法检查 + 单元测试
```

## 单元测试

`test/` 覆盖全部纯函数（无 React/DOM 依赖，零外部依赖运行）：

| 文件 | 覆盖 |
| --- | --- |
| `test/host.test.ts` | `http`（isLoopback/shq/shellJoin）、`git`（porcelain/log 解析、isGitRepo/status/diff/branches，mock shell） |
| `test/fs-search.test.ts` | `fs`（listDir/readText 截断/目录判定，mock fs）、`search`（文件名递归/跳过 .git/预算截断、内容搜索行解析） |
| `test/client.test.ts` | `util`（相对时间/basename/状态推导）、`left/derive`（分组/归档/blank/搜索合并）、`right/derive`（badge/staged 分类） |

## 源码结构（模块化）

```
src/
├── host/                    # Host 半区（ESM，经 webServer 暴露 /dsp-sidebar/api）
│   ├── index.ts             # 入口：路由装配 + API 方法表
│   ├── http.ts              # HTTP 辅助：JSON 响应 / 请求体 / 回环校验 / 参数转义
│   ├── git.ts               # Git 操作：runGit + porcelain/NUL/log 解析 + 各方法
│   ├── fs.ts                # 文件系统操作：列目录 / 读文本（512KB 截断）
│   └── search.ts            # 搜索：文件名递归匹配 + 内容逐行匹配
└── client/                  # Client 半区（esbuild → __ModuleLoader__ bundle）
    ├── index.ts             # 入口：注入样式 / 注册词典 / 注册席位
    ├── api.ts               # /dsp-sidebar/api fetch 封装
    ├── i18n.ts              # 中英双语词典（NS 与键类型）
    ├── types.ts             # 契约：会话/工作区数据面 + Host API 面 + git wire 形状
    ├── util.ts              # 共享工具：相对时间 / basename / 状态推导
    ├── icons.tsx            # 图标（lucide 风格内联 SVG）
    ├── styles/              # 按组件域拆分 CSS + 聚合注入
    │   ├── left.css         # 左侧栏样式
    │   ├── right.css        # 右侧栏样式
    │   └── index.ts         # injectStyles（幂等注入一个 style 标签）
    ├── left/                # 左侧栏（对齐官方 WorkspaceBrowser + rows/ + tree/）
    │   ├── derive.ts        # 数据推导：分组 / 搜索合并
    │   ├── rows.tsx         # 行组件：SessionCard / SearchRow / GroupSection
    │   └── WorkspaceBrowser.tsx  # 主组件：标题头 + 搜索 + 列表 + rail
    └── right/               # 右侧栏（对齐官方 RightSidebar + SourceControl + FileExplorer）
        ├── derive.ts        # git 状态分类（badge / staged / unstaged / untracked）
        ├── FilesPanel.tsx   # 文件浏览器（懒加载树 + 搜索 + 预览）
        ├── GitPanel.tsx     # Git 面板（状态 / 暂存 / diff / 提交 / 历史 / 分支）
        └── RightPanel.tsx   # 面板外壳（活动条 + 标签切换）+ 头部开关
```

## 架构

- **Host**（`src/host/`）：经 `webServer` 注册 `/dsp-sidebar/api` 前缀路由（POST，方法名在路径末段），提供方法：
  `fs.list` / `fs.read` / `fs.search`（文件名 + 内容）/ `git.status` / `git.diff` / `git.stage` / `git.unstage` / `git.discard` / `git.commit` / `git.log` / `git.branches` / `git.checkout`
  - 文件操作走挂载的 `fs` 服务（`resolve` → `listDir`/`stat`/`readText`/`readBytes`），尊重沙箱与观测策略
  - Git 操作走挂载的 `shell` 服务（`resolve` + `run`，`git -C <cwd>` + porcelain/NUL 解析），与官方 bash 工具同一执行通路
- **Client**（`src/client/`）：`fetch('/dsp-sidebar/api/...')` 调用 Host；注册席位（`sidebar.workspaces` / `details` / `conversation.session.header.utilities`），全部使用 DSH 主题 token（`--dsw-alias-*` / `--ds-*`），随浅色/深色自适应

## License

MIT
