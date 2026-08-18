// Cookie Manager — lưu cookie YouTube/Facebook/TikTok cho yt-dlp
// Port 14331, bind 127.0.0.1 only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const COOKIE_DIR = process.env.VIDEO_TRANSCRIPT_COOKIE_DIR || path.join(process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || "", ".openclaw", "workspace"), "cookies");
const PORT = Number(process.env.COOKIE_PORT || 14331);
const HOST = process.env.COOKIE_HOST || "127.0.0.1";
const PLATFORMS = ["youtube", "facebook", "tiktok"];

fs.mkdirSync(COOKIE_DIR, { recursive: true });

function netscapePath(p) { return path.join(COOKIE_DIR, `${p}.txt`); }
function origPath(p) { return path.join(COOKIE_DIR, `${p}.orig`); }

function normalizeCookie(c) {
  const domain = String(c.domain || c.host || "").trim().toLowerCase();
  const name = String(c.name || "").trim();
  const value = c.value == null ? "" : String(c.value);
  if (!domain || !name) throw new Error("Cookie thiếu domain hoặc name");
  const hostOnly = c.hostOnly === true;
  const expRaw = c.expirationDate ?? c.expiration ?? c.expires ?? 0;
  const expiration = Math.max(0, Math.floor(Number(expRaw) || 0));
  return {
    domain,
    includeSubdomains: !hostOnly,
    path: String(c.path || "/"),
    secure: c.secure === true,
    httpOnly: c.httpOnly === true,
    expiration,
    name,
    value,
  };
}

function parseCookies(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) throw new Error("Nội dung cookie rỗng");
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let data;
    try { data = JSON.parse(trimmed); } catch (e) {
      throw new Error("JSON không hợp lệ: " + e.message);
    }
    if (!Array.isArray(data)) {
      if (Array.isArray(data.cookies)) data = data.cookies;
      else throw new Error("JSON phải là mảng cookie hoặc {cookies: [...]}");
    }
    if (!data.length) throw new Error("Mảng cookie rỗng");
    return data.map(normalizeCookie);
  }
  // Netscape text format
  const out = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const p = line.split("\t");
    if (p.length < 7) continue;
    out.push({
      domain: p[0].trim().toLowerCase(),
      includeSubdomains: p[1].trim().toUpperCase() === "TRUE",
      path: p[2].trim() || "/",
      secure: p[3].trim().toUpperCase() === "TRUE",
      httpOnly: false,
      expiration: Math.max(0, Math.floor(Number(p[4]) || 0)),
      name: p[5].trim(),
      value: p.slice(6).join("\t"),
    });
  }
  if (!out.length) throw new Error("Không tìm thấy dòng cookie Netscape hợp lệ");
  return out;
}

function toNetscape(cookies) {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    const domain = c.includeSubdomains && !c.domain.startsWith(".") ? "." + c.domain : c.domain;
    lines.push([domain, c.includeSubdomains ? "TRUE" : "FALSE", c.path, c.secure ? "TRUE" : "FALSE", c.expiration, c.name, c.value].join("\t"));
  }
  return lines.join("\n") + "\n";
}

function platformStatus(p) {
  const f = netscapePath(p);
  if (!fs.existsSync(f)) return { platform: p, exists: false };
  const st = fs.statSync(f);
  const raw = fs.readFileSync(f, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const domains = [...new Set(lines.map((l) => l.split("\t")[0]).filter(Boolean))];
  return {
    platform: p,
    exists: true,
    cookieCount: lines.length,
    domains: domains.slice(0, 8),
    sizeBytes: st.size,
    updatedAt: st.mtime.toISOString(),
  };
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Body quá lớn")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("404"); return; }
    const ext = path.extname(file).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (u.pathname === "/api/cookies" && req.method === "GET") {
      return sendJson(res, 200, { platforms: PLATFORMS.map(platformStatus) });
    }
    if (u.pathname === "/api/cookies" && req.method === "POST") {
      const body = JSON.parse(await readBody(req));
      const platform = String(body.platform || "").toLowerCase();
      if (!PLATFORMS.includes(platform)) return sendJson(res, 400, { error: `Platform phải là: ${PLATFORMS.join(", ")}` });
      const cookies = parseCookies(body.content);
      fs.writeFileSync(netscapePath(platform), toNetscape(cookies));
      fs.writeFileSync(origPath(platform), String(body.content));
      return sendJson(res, 200, { ok: true, saved: platformStatus(platform) });
    }
    if (u.pathname === "/api/cookies" && req.method === "DELETE") {
      const platform = (u.searchParams.get("platform") || "").toLowerCase();
      if (!PLATFORMS.includes(platform)) return sendJson(res, 400, { error: "Platform không hợp lệ" });
      for (const f of [netscapePath(platform), origPath(platform)]) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      return sendJson(res, 200, { ok: true, deleted: platform });
    }
    if (u.pathname === "/api/health") return sendJson(res, 200, { ok: true, port: PORT });
    if (u.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "Not found" });
    return serveStatic(req, res, u.pathname);
  } catch (e) {
    return sendJson(res, 400, { error: e.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Cookie Manager: http://${HOST}:${PORT} (cookies tại ${COOKIE_DIR})`);
});
