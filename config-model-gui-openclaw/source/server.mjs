import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const exec = promisify(execFile);
const requestedPort = Number(process.env.PORT || 18790);
const host = process.env.HOST || "127.0.0.1";
const publicDir = join(import.meta.dirname, "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
const apiTypes = new Set(["openai-completions", "openai-responses", "openai-chatgpt-responses", "anthropic-messages", "google-generative-ai", "google-vertex", "github-copilot", "bedrock-converse-stream", "ollama", "azure-openai-responses"]);

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(Buffer.isBuffer(body) ? body : typeof body === "string" ? body : JSON.stringify(body));
}
async function openclaw(args, input) {
  if (input === undefined) return exec("openclaw", args, { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
  return new Promise((resolve, reject) => {
    const child = spawn("openclaw", args, { stdio: ["pipe", "pipe", "pipe"] }); let stdout = "", stderr = "";
    child.stdout.on("data", c => stdout += c); child.stderr.on("data", c => stderr += c);
    child.on("error", reject); child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(Object.assign(Error(stderr || `openclaw exited ${code}`), { stderr })));
    child.stdin.end(input);
  });
}
async function rawConfigFile() {
  const path = process.env.OPENCLAW_CONFIG_PATH || `${process.env.HOME}/.openclaw/openclaw.json`;
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return {}; }
}
async function rawModels() {
  const { stdout } = await openclaw(["config", "get", "models", "--json"]);
  return JSON.parse(stdout || "{}");
}
async function rawModelsWithSecrets() {
  const [models, config] = await Promise.all([rawModels(), rawConfigFile()]);
  const fileProviders = config.models?.providers || {};
  for (const [id, provider] of Object.entries(models.providers || {})) {
    const realKey = fileProviders[id]?.apiKey;
    if (realKey && realKey !== "__OPENCLAW_REDACTED__") provider.apiKey = realKey;
  }
  return models;
}
async function rawAllowlist() {
  try {
    const { stdout } = await openclaw(["config", "get", "agents.defaults.models", "--json"]);
    return JSON.parse(stdout || "{}");
  } catch { return {}; }
}
async function rawAgentDefaults() {
  try {
    const { stdout } = await openclaw(["config", "get", "agents.defaults", "--json"]);
    return JSON.parse(stdout || "{}");
  } catch { return {}; }
}
async function getConfig() {
  const models = await rawModelsWithSecrets();
  const providers = Object.entries(models.providers || {}).map(([id, p]) => ({
    id, providerType: p.api === "anthropic-messages" ? "anthropic" : p.api === "ollama" ? "ollama" : p.api === "openai-responses" ? "openai-responses" : "openai", baseUrl: p.baseUrl || "", api: p.api || "openai-completions", auth: p.auth || "api-key",
    contextWindow: p.contextWindow ?? "", maxTokens: p.maxTokens ?? "", timeoutSeconds: p.timeoutSeconds ?? "",
    apiKey: p.apiKey || "",
    hasApiKey: Boolean(p.apiKey), models: (p.models || []).map(m => ({ id: m.id, name: m.name, api: m.api || "", reasoning: Boolean(m.reasoning), input: m.input || ["text"], contextWindow: m.contextWindow ?? "", maxTokens: m.maxTokens ?? "" }))
  }));
  const defaults = await rawAgentDefaults();
  return { mode: models.mode || "merge", providers, primary: defaults.model?.primary || "", fallbacks: defaults.model?.fallbacks || [], allowlist: await rawAllowlist() };
}
async function fetchCatalog(providerId) {
  // Dùng cùng catalog/resolver với CLI, tránh tự gửi API key đã được redacted.
  const { stdout } = await openclaw(["models", "list", "--all", "--provider", providerId, "--json"]);
  const body = JSON.parse(stdout || "{}");
  return (body.models || []).map(m => ({
    id: m.key.slice(m.key.indexOf("/") + 1),
    name: m.name || m.key.slice(m.key.indexOf("/") + 1),
    key: m.key,
    input: m.input,
    contextWindow: m.contextWindow,
    tags: m.tags || [],
  }));
}
function num(value, label) { if (value === "" || value === undefined || value === null) return undefined; const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw Error(`${label} phải là số dương.`); return n; }
function cleanProvider(row) {
  if (!row || !/^[a-zA-Z0-9_-]+$/.test(row.id || "")) throw Error("Provider ID chỉ gồm chữ, số, gạch nối hoặc gạch dưới.");
  if (!row.baseUrl || !/^https?:\/\//.test(row.baseUrl)) throw Error(`Base URL của ${row.id} phải bắt đầu bằng http:// hoặc https://.`);
  if (!apiTypes.has(row.api)) throw Error(`API adapter của ${row.id} không hợp lệ.`);
  const p = { baseUrl: row.baseUrl.trim().replace(/\/$/, ""), api: row.api, models: [] };
  if (row.auth && row.auth !== "api-key") p.auth = row.auth;
  for (const key of ["contextWindow", "maxTokens", "timeoutSeconds"]) { const value = num(row[key], `${row.id}: ${key}`); if (value !== undefined) p[key] = value; }
  for (const model of row.models || []) {
    if (!model.id?.trim() || !model.name?.trim()) throw Error(`Model trong ${row.id} cần ID và tên.`);
    const m = { id: model.id.trim(), name: model.name.trim() };
    if (model.api) { if (!apiTypes.has(model.api)) throw Error(`API adapter model ${m.id} không hợp lệ.`); m.api = model.api; }
    m.reasoning = Boolean(model.reasoning);
    if (Array.isArray(model.input) && model.input.length) m.input = model.input.filter(x => ["text", "image", "audio", "video"].includes(x));
    for (const key of ["contextWindow", "maxTokens"]) { const value = num(model[key], `${m.id}: ${key}`); if (value !== undefined) m[key] = value; }
    p.models.push(m);
  }
  if (row.apiKey?.trim()) p.apiKey = row.apiKey.trim();
  return p;
}
function exposedProvider(id, p = {}) {
  return {
    id, baseUrl: p.baseUrl || "", api: p.api || "openai-completions", auth: p.auth || "api-key",
    contextWindow: p.contextWindow ?? "", maxTokens: p.maxTokens ?? "", timeoutSeconds: p.timeoutSeconds ?? "",
    models: (p.models || []).map(m => ({ id: m.id, name: m.name, api: m.api || "", reasoning: Boolean(m.reasoning), input: m.input || ["text"], contextWindow: m.contextWindow ?? "", maxTokens: m.maxTokens ?? "" }))
  };
}
function sameProvider(row, id, old) {
  const cleanRow = { ...row, id, apiKey: undefined };
  delete cleanRow.apiKey;
  return JSON.stringify(cleanRow) === JSON.stringify(exposedProvider(id, old));
}
async function saveConfig(payload) {
  if (!payload || !["merge", "replace"].includes(payload.mode)) throw Error("Model catalog mode không hợp lệ.");
  const [existing, existingAllowlist, existingDefaults] = await Promise.all([rawModelsWithSecrets(), rawAllowlist(), rawAgentDefaults()]);
  const seen = new Set(), providers = {};

  if (payload.mode === "replace") {
    // Mode replace: Xóa toàn bộ provider cũ không có trong danh sách gửi lên, thiết lập chính xác các provider được gửi
    for (const row of payload.providers || []) {
      if (seen.has(row.id)) throw Error(`Provider ID bị trùng: ${row.id}`);
      seen.add(row.id);
      const old = existing.providers?.[row.id];
      const next = cleanProvider(row);
      providers[row.id] = next;
      // Nếu không nhập key mới nhưng cũ có key, giữ nguyên key cũ
      if (!row.apiKey?.trim() && old?.apiKey !== undefined) {
        providers[row.id].apiKey = old.apiKey;
      }
    }
    // Xóa provider cũ
    for (const oldId of Object.keys(existing.providers || {})) {
      if (!seen.has(oldId)) providers[oldId] = null;
    }
  } else {
    // Mode merge: Giữ nguyên provider cùng tên nếu không sửa, cập nhật nếu sửa, thêm mới nếu khác tên
    for (const row of payload.providers || []) {
      if (seen.has(row.id)) throw Error(`Provider ID bị trùng: ${row.id}`);
      seen.add(row.id);
      const old = existing.providers?.[row.id];
      const next = cleanProvider(row);
      providers[row.id] = { ...old, ...next };
      if (!row.apiKey?.trim() && old?.apiKey !== undefined) {
        providers[row.id].apiKey = old.apiKey;
      }
    }
  }

  const modelPatch = {};
  if (payload.mode !== (existing.mode || "merge")) modelPatch.mode = payload.mode;
  if (Object.keys(providers).length) modelPatch.providers = providers;

  // Keep Control UI /model picker in sync with models managed by this GUI.
  const allowlist = { ...existingAllowlist };
  if (payload.mode === "replace") {
    for (const oldId of Object.keys(existing.providers || {})) {
      if (!seen.has(oldId)) {
        for (const ref of Object.keys(allowlist)) {
          if (ref.startsWith(`${oldId}/`)) delete allowlist[ref];
        }
      }
    }
  }
  for (const row of payload.providers || []) {
    const prefix = `${row.id}/`;
    for (const ref of Object.keys(allowlist)) {
      if (ref.startsWith(prefix)) delete allowlist[ref];
    }
    for (const model of row.models || []) {
      if (!model.id?.trim()) continue;
      const previous = existingAllowlist[`${row.id}/${model.id.trim()}`] || {};
      allowlist[`${row.id}/${model.id.trim()}`] = previous;
    }
  }

  const patch = {};
  if (Object.keys(modelPatch).length) patch.models = modelPatch;
  const nextDefaults = { ...existingDefaults, model: { ...(existingDefaults.model || {}) } };
  // Blank means keep current. Change primary only when submitted value differs.
  const currentPrimary = existingDefaults.model?.primary || "";
  if (typeof payload.primary === "string" && payload.primary.trim() && payload.primary.trim() !== currentPrimary) {
    nextDefaults.model.primary = payload.primary.trim();
  }
  if (payload.fallbacks !== undefined) nextDefaults.model.fallbacks = Array.isArray(payload.fallbacks) ? payload.fallbacks : [];
  const agentsPatch = {};
  if (JSON.stringify(allowlist) !== JSON.stringify(existingAllowlist)) agentsPatch.models = allowlist;
  if ((typeof payload.primary === "string" && payload.primary.trim() && payload.primary.trim() !== currentPrimary) || payload.fallbacks !== undefined) agentsPatch.model = nextDefaults.model;
  if (Object.keys(agentsPatch).length) patch.agents = { defaults: agentsPatch };
  if (Object.keys(patch).length) {
    const patchArgs = ["config", "patch", "--stdin"];
    // replace mode intentionally makes each submitted provider model list exact.
    // OpenClaw protects provider model arrays unless replacement is explicit.
    if (payload.mode === "replace") {
      for (const row of payload.providers || []) {
        patchArgs.push("--replace-path", `models.providers.${row.id}.models`);
      }
    }
    await openclaw(patchArgs, JSON.stringify(patch));
  }
  return getConfig();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/config") return send(res, 200, await getConfig());
    if (req.method === "GET" && req.url.startsWith("/api/catalog?provider=")) {
      const id = decodeURIComponent(new URL(req.url, "http://localhost").searchParams.get("provider"));
      const models = await rawModels(); const provider = models.providers?.[id];
      if (!provider) throw Error(`Không tìm thấy provider: ${id}`);
      return send(res, 200, { provider: id, models: await fetchCatalog(id) });
    }
    if (req.method === "POST" && req.url === "/api/config") {
      let body = ""; for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) throw Error("Payload quá lớn."); }
      return send(res, 200, await saveConfig(JSON.parse(body)));
    }
    if (req.method === "POST" && req.url === "/api/validate") { await openclaw(["config", "validate"]); return send(res, 200, { ok: true }); }
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    const rawPath = req.url === "/" ? "/index.html" : new URL(req.url, "http://localhost").pathname;
    const file = normalize(join(publicDir, rawPath));
    if (!file.startsWith(publicDir)) return send(res, 403, { error: "Forbidden" });
    return send(res, 200, await readFile(file), types[extname(file)] || "application/octet-stream");
  } catch (error) { send(res, 400, { error: error.stderr?.trim() || error.message || "Lỗi không rõ." }); }
});
function listenNext(candidate) {
  server.once("error", error => {
    if (error.code === "EADDRINUSE") return listenNext(candidate + 1);
    throw error;
  });
  server.listen(candidate, host, () => {
    server.removeAllListeners("error");
    console.log(`OpenClaw Model Config: http://${host}:${candidate}`);
  });
}
listenNext(requestedPort);
