// src/host/http.ts
function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1" || address === "localhost";
}
function sendJson(res, status2, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status2, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}
async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON");
  }
}
function shq(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
function shellJoin(args) {
  return args.map((a) => {
    const s = String(a);
    return /^[A-Za-z0-9_./:@-]+$/.test(s) ? s : shq(s);
  }).join(" ");
}

// src/host/git.ts
async function runGit(shell, cwd, args, timeoutMs) {
  if (!shell) throw new Error("shell \u670D\u52A1\u4E0D\u53EF\u7528");
  const spec = shell.resolve({
    command: "git " + shellJoin(args),
    workdir: cwd,
    timeoutMs: timeoutMs || 3e4
  });
  const result = await shell.run(spec);
  if (result.exitCode !== 0) {
    const msg = result.stderr && result.stderr.text ? result.stderr.text.trim() : "git exited " + String(result.exitCode);
    throw new Error(msg);
  }
  return result.stdout ? result.stdout.text : "";
}
function parsePorcelainZ(output) {
  const tokens = output.split("\0");
  const entries = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    i += 1;
    if (token === "") continue;
    const xy = token.slice(0, 2);
    const path = token.slice(3);
    entries.push({ path, xy });
    if ((xy[0] === "R" || xy[0] === "C") && tokens[i] !== void 0 && tokens[i] !== "") i += 1;
  }
  return entries;
}
function parseLogLines(output) {
  const rows = [];
  for (const line of output.split("\n")) {
    if (line === "") continue;
    const [hash, subject, author, date, hashFull, refs] = line.split("");
    if (hash === void 0 || subject === void 0) continue;
    rows.push({ hash, subject, author: author || "", date: date || "", hashFull: hashFull || hash, refs: refs || "" });
  }
  return rows;
}
async function isGitRepo(shell, cwd) {
  try {
    const out = await runGit(shell, cwd, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}
async function status(shell, cwd) {
  const repo = await isGitRepo(shell, cwd);
  if (!repo) return { isRepo: false, entries: [] };
  const [branch, raw] = await Promise.all([
    runGit(shell, cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "HEAD"),
    runGit(shell, cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"])
  ]);
  return { isRepo: true, branch: branch.trim(), entries: parsePorcelainZ(raw) };
}
async function statusMap(shell, cwd) {
  const repo = await isGitRepo(shell, cwd);
  if (!repo) return { isRepo: false, map: {} };
  const raw = await runGit(shell, cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
  const map = {};
  for (const e of parsePorcelainZ(raw)) {
    map[e.path] = e.xy;
  }
  return { isRepo: true, map };
}
async function diff(shell, cwd, path, staged) {
  const argv = ["diff", "--no-ext-diff", "--no-color", "-U3"];
  if (staged) argv.push("--cached");
  if (path !== void 0) argv.push("--", path);
  return runGit(shell, cwd, argv);
}
async function stage(shell, cwd, path) {
  await runGit(shell, cwd, ["add", "-A", ...path !== void 0 ? ["--", path] : []]);
}
async function unstage(shell, cwd, path) {
  await runGit(shell, cwd, ["reset", "-q", ...path !== void 0 ? ["--", path] : []]);
}
async function discard(shell, cwd, path) {
  await runGit(shell, cwd, ["checkout", "--", ...path !== void 0 ? [path] : ["."]]);
}
async function commit(shell, cwd, message) {
  await runGit(shell, cwd, ["commit", "-m", message]);
}
async function log(shell, cwd, count = 20) {
  const raw = await runGit(shell, cwd, [
    "log",
    "-n",
    String(count),
    "--decorate=short",
    "--pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D"
  ]);
  return parseLogLines(raw);
}
async function branches(shell, cwd) {
  const current = (await runGit(shell, cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "HEAD")).trim();
  const raw = await runGit(shell, cwd, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  const names = raw.split("\n").filter((l) => l !== "");
  return { current, names: names.includes(current) ? names : [current, ...names] };
}
function parseNameStatus(output) {
  const files = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const parts = trimmed.split("	");
    if (parts.length < 2) continue;
    const status2 = parts[0];
    if (status2.length < 1) continue;
    const path = status2[0] === "R" || status2[0] === "C" ? parts[2] ?? parts[1] : parts[1];
    files.push({ status: status2[0], path });
  }
  return files;
}
async function logFiles(shell, cwd, hash) {
  const raw = await runGit(shell, cwd, ["show", "--name-status", "--format=", "--no-color", hash]);
  return parseNameStatus(raw);
}
async function showDiff(shell, cwd, hash, path) {
  return runGit(shell, cwd, ["show", "--no-ext-diff", "--no-color", "-U3", "--format=", hash, "--", path]);
}
async function checkout(shell, cwd, branch) {
  await runGit(shell, cwd, ["checkout", branch]);
}

// src/host/fs.ts
async function listDir(fs, path) {
  if (!fs) throw new Error("fs \u670D\u52A1\u4E0D\u53EF\u7528");
  const target = await fs.resolve(path);
  const entries = await fs.listDir(target);
  return { ok: true, entries: entries.map((e) => ({ name: e.name, type: e.type, size: e.size })) };
}
async function readText(fs, path) {
  if (!fs) throw new Error("fs \u670D\u52A1\u4E0D\u53EF\u7528");
  const target = await fs.resolve(path);
  const info = await fs.stat(target);
  if (!info) return { ok: true, kind: "missing", content: "" };
  if (info.type !== "file") return { ok: true, kind: "binary", content: "" };
  const cap = 512 * 1024;
  if (info.size !== void 0 && info.size > cap) {
    const bytes = await fs.readBytes(target, void 0, cap);
    const text = new TextDecoder().decode(bytes);
    return { ok: true, kind: "text", content: text, truncated: true };
  }
  try {
    const text = await fs.readText(target);
    return { ok: true, kind: "text", content: text, truncated: false };
  } catch {
    return { ok: true, kind: "binary", content: "" };
  }
}
async function writeText(fs, path, content) {
  if (!fs) throw new Error("fs \u670D\u52A1\u4E0D\u53EF\u7528");
  const target = await fs.resolve(path);
  await fs.writeText(target, content);
  return { ok: true };
}

// src/host/search.ts
var DEFAULT_MAX_MATCHES = 200;
var DEFAULT_MAX_VISITED = 1e5;
async function searchNames(fs, root, query, opts = {}) {
  if (!fs) throw new Error("fs \u670D\u52A1\u4E0D\u53EF\u7528");
  const needle = query.trim().toLowerCase();
  if (needle === "") return { matches: [], truncated: false };
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const maxVisited = opts.maxVisited ?? DEFAULT_MAX_VISITED;
  const matches = [];
  let visited = 0;
  let truncated = false;
  const walk = async (dir) => {
    if (truncated) return;
    const entries = await listLevel(fs, dir);
    if (entries === void 0) return;
    for (const entry of entries) {
      visited += 1;
      if (visited > maxVisited) {
        truncated = true;
        return;
      }
      if (entry.isDir && entry.name === ".git") continue;
      const rel = relativePath(root, dir, entry.name);
      if (entry.name.toLowerCase().includes(needle)) {
        matches.push({ path: rel, isDir: entry.isDir });
        if (matches.length >= maxMatches) {
          truncated = true;
          return;
        }
      }
      if (entry.isDir && !entry.isSymlink) {
        await walk(joinPath(dir, entry.name));
        if (truncated) return;
      }
    }
  };
  await walk(root);
  matches.sort((a, b) => a.path < b.path ? -1 : 1);
  return { matches, truncated };
}
async function searchContent(shell, root, query, opts = {}) {
  const q = query.trim();
  if (q === "") return { matches: [], truncated: false };
  if (!shell) throw new Error("shell \u670D\u52A1\u4E0D\u53EF\u7528");
  const maxResults = opts.maxResults ?? DEFAULT_MAX_MATCHES;
  const limit = String(maxResults);
  const needle = quoteForShell(q);
  const rgCmd = 'rg -n --no-heading --fixed-strings -i --max-count 500 --max-filesize 1M --glob "!.git/**" --glob "!node_modules/**" ' + needle + " . 2>/dev/null | head -n " + limit;
  const grepCmd = "grep -rIn -m 500 -i --exclude-dir=.git --exclude-dir=node_modules " + needle + " . 2>/dev/null | head -n " + limit;
  let out = "";
  try {
    out = await runSearch(shell, root, rgCmd);
  } catch {
    out = await runSearch(shell, root, grepCmd);
  }
  return { matches: parseSearchLines(out), truncated: false };
}
async function runSearch(shell, root, command) {
  const spec = shell.resolve({
    command,
    workdir: root,
    timeoutMs: 15e3
  });
  const result = await shell.run(spec);
  if (result.exitCode !== 0) {
    if (result.exitCode === 1) return "";
    throw new Error(result.stderr?.text?.trim() || "\u641C\u7D22\u5931\u8D25");
  }
  return result.stdout ? result.stdout.text : "";
}
function quoteForShell(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
function parseSearchLines(output) {
  const matches = [];
  for (const line of output.split("\n")) {
    if (line === "") continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    let path = line.slice(0, sep);
    if (path.startsWith("./")) path = path.slice(2);
    const rest = line.slice(sep + 1);
    const lineSep = rest.indexOf(":");
    const lineNo = Number(lineSep > 0 ? rest.slice(0, lineSep) : "0");
    const content = lineSep > 0 ? rest.slice(lineSep + 1) : rest;
    matches.push({ path, line: Number.isFinite(lineNo) ? lineNo : 0, content });
  }
  return matches;
}
async function listLevel(fs, dir) {
  try {
    const target = await fs.resolve(dir);
    const entries = await fs.listDir(target);
    return entries.map((e) => ({ name: e.name, isDir: e.type === "directory", isSymlink: false }));
  } catch {
    return void 0;
  }
}
function relativePath(root, dir, name2) {
  if (dir === root) return name2;
  return dir.slice(root.length).replace(/[\\/]+/g, "/").replace(/^\/+/, "") + "/" + name2;
}
function joinPath(dir, name2) {
  return dir.endsWith("/") || dir.endsWith("\\") ? dir + name2 : dir + "/" + name2;
}

// src/host/session.ts
import { randomUUID } from "node:crypto";
async function copySessionTo(ctx, srcId, targetPath) {
  const sessionQuery = ctx.get("sessionQuery");
  const workspaceRegistry = ctx.get("workspaceRegistry");
  const agents = ctx.get("agents");
  if (sessionQuery === void 0) throw new Error("\u4F1A\u8BDD\u67E5\u8BE2\u670D\u52A1\u4E0D\u53EF\u7528");
  if (workspaceRegistry === void 0) throw new Error("\u5DE5\u4F5C\u533A\u6CE8\u518C\u670D\u52A1\u4E0D\u53EF\u7528");
  if (agents === void 0) throw new Error("\u4F1A\u8BDD\u521B\u5EFA\u670D\u52A1\u4E0D\u53EF\u7528");
  const target = await workspaceRegistry.resolveByPath(targetPath);
  if (target === void 0) throw new Error("\u76EE\u6807\u6587\u4EF6\u5939\u672A\u6CE8\u518C\u4E3A\u5DE5\u4F5C\u533A");
  const snapshot = await sessionQuery.readSession(srcId);
  const events = snapshot.events;
  const cut = completedCut(events);
  const childId = "session-" + randomUUID();
  const composition = await composeAgent(ctx, snapshot);
  const defaultModel = ctx.get("agentDefaultModel");
  const selection = defaultModel === void 0 ? void 0 : defaultModel.currentSelection();
  await agents.create({
    sessionId: childId,
    ...cut > 0 ? { seed: events.slice(0, cut) } : {},
    meta: {
      cwd: targetPath,
      parentSession: snapshot.session.id,
      ...cut > 0 ? { seedLength: cut } : {},
      ...composition.agentPreset === void 0 ? {} : { agentPreset: composition.agentPreset }
    },
    agentOptions: selection ?? {},
    setup: composition.setup
  });
  try {
    await target.attachSession(childId);
  } catch (error) {
    console.warn("dsh-plugin-sidebar: session " + childId + " created but workspace attach failed: " + String(error));
  }
  return { sessionId: childId };
}
function completedCut(events) {
  if (events.length === 0) return 0;
  const boundary = findLastTurnEnd(events);
  if (boundary === void 0) throw new Error("\u4F1A\u8BDD\u5C1A\u65E0\u5DF2\u5B8C\u6210\u8F6E\u6B21\uFF0C\u65E0\u6CD5\u590D\u5236");
  let cut = boundary.seq + 1;
  while (cut < events.length && events[cut]?.type !== "turn/start") cut += 1;
  return cut;
}
function findLastTurnEnd(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === "turn/end") return events[index];
  }
  return void 0;
}
function resolveSessionPreset(snapshot) {
  for (let index = snapshot.events.length - 1; index >= 0; index -= 1) {
    const event = snapshot.events[index];
    if (event?.type === "agent-preset/selected") return event.data?.agentPreset;
  }
  return snapshot.session.agentPreset;
}
async function composeAgent(ctx, snapshot) {
  const presets = ctx.get("agentPresets");
  if (presets === void 0) return { setup: () => Promise.resolve() };
  const resolved = await presets.resolve(resolveSessionPreset(snapshot));
  return {
    agentPreset: resolved.id,
    // setup 返回值会被当作 AgentSetupCommit 处理（需 .commit() 函数）—— 不得透传 mount 结果
    setup: async (agentCtx) => {
      await presets.mount(agentCtx, resolved.id);
    }
  };
}

// src/host/index.ts
var name = "@webkong/dsh-plugin-sidebar";
var inject = ["webServer"];
function apply(ctx) {
  const shell = ctx.get("shell");
  const fs = ctx.get("fs");
  const webServer = ctx.get("webServer");
  const str = (v) => typeof v === "string" ? v : "";
  const has = (v) => typeof v === "string" && v !== "";
  const api = {
    "fs.list": async (p) => listDir(fs, str(p.path)),
    "fs.read": async (p) => readText(fs, str(p.path)),
    "fs.write": async (p) => writeText(fs, str(p.path), str(p.content)),
    "fs.search": async (p) => {
      const mode = p.mode === "content" ? "content" : "name";
      const root = str(p.path);
      const query = str(p.query);
      if (mode === "content") {
        const { matches: matches2, truncated: truncated2 } = await searchContent(shell, root, query);
        return { ok: true, result: { mode, matches: matches2, truncated: truncated2 } };
      }
      const { matches, truncated } = await searchNames(fs, root, query);
      return { ok: true, result: { mode, matches, truncated } };
    },
    "fs.gitStatus": async (p) => ({ ok: true, result: await statusMap(shell, str(p.cwd)) }),
    "git.status": async (p) => ({ ok: true, result: await status(shell, str(p.cwd)) }),
    "git.diff": async (p) => ({ ok: true, result: await diff(shell, str(p.cwd), has(p.path) ? str(p.path) : void 0, p.staged === true) }),
    "git.stage": async (p) => {
      await stage(shell, str(p.cwd), has(p.path) ? str(p.path) : void 0);
      return { ok: true };
    },
    "git.unstage": async (p) => {
      await unstage(shell, str(p.cwd), has(p.path) ? str(p.path) : void 0);
      return { ok: true };
    },
    "git.discard": async (p) => {
      await discard(shell, str(p.cwd), str(p.path));
      return { ok: true };
    },
    "git.commit": async (p) => {
      const message = str(p.message);
      if (!message.trim()) throw new Error("\u63D0\u4EA4\u4FE1\u606F\u4E0D\u80FD\u4E3A\u7A7A");
      await commit(shell, str(p.cwd), message);
      return { ok: true };
    },
    "git.log": async (p) => ({ ok: true, result: await log(shell, str(p.cwd), Number(p.count) || 20) }),
    "git.logFiles": async (p) => ({ ok: true, result: await logFiles(shell, str(p.cwd), str(p.hash)) }),
    "git.showDiff": async (p) => ({ ok: true, result: await showDiff(shell, str(p.cwd), str(p.hash), str(p.path)) }),
    "git.branches": async (p) => ({ ok: true, result: await branches(shell, str(p.cwd)) }),
    "git.checkout": async (p) => {
      await checkout(shell, str(p.cwd), str(p.branch));
      return { ok: true };
    },
    "session.copyTo": async (p) => {
      const srcId = str(p.srcId);
      const targetPath = str(p.targetPath);
      if (!srcId) throw new Error("\u7F3A\u5C11\u6E90\u4F1A\u8BDD id");
      if (!targetPath) throw new Error("\u7F3A\u5C11\u76EE\u6807\u6587\u4EF6\u5939");
      const result = await copySessionTo(ctx, srcId, targetPath);
      return { ok: true, result };
    }
  };
  ctx.effect(() => {
    const route = {
      kind: "prefix",
      path: "/dsp-sidebar/api",
      handler: async (req, res) => {
        if (!isLoopback(req.socket?.remoteAddress ?? "")) {
          sendJson(res, 403, { ok: false, error: "\u4EC5\u5141\u8BB8\u672C\u673A\u8BBF\u95EE" });
          return;
        }
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "method not allowed" });
          return;
        }
        const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
        const method = pathname.startsWith("/dsp-sidebar/api/") ? pathname.slice("/dsp-sidebar/api/".length) : void 0;
        if (method === void 0 || method.includes("/")) {
          sendJson(res, 404, { ok: false, error: "unknown API method" });
          return;
        }
        const handler = api[method];
        if (handler === void 0) {
          sendJson(res, 404, { ok: false, error: 'unknown API method "' + method + '"' });
          return;
        }
        try {
          const payload = await readBody(req);
          sendJson(res, 200, await handler(payload));
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    return webServer ? webServer.register(route) : void 0;
  }, "@webkong/dsh-plugin-sidebar: /dsp-sidebar/api routes");
  console.log("dsh-plugin-sidebar: host ready (/dsp-sidebar/api, " + Object.keys(api).length + " methods)");
}
export {
  apply,
  inject,
  name
};
