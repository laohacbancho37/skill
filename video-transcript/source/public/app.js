const PLATFORMS = ["youtube", "facebook", "tiktok"];
let current = "youtube";
let state = {};

const $ = (id) => document.getElementById(id);

function renderTabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  for (const p of PLATFORMS) {
    const b = document.createElement("button");
    b.className = "tab" + (p === current ? " active" : "");
    const info = state[p];
    b.innerHTML = `<span class="dot ${info && info.exists ? "on" : ""}"></span>${p}`;
    b.onclick = () => { current = p; $("platName").textContent = p; renderTabs(); renderMeta(); };
    tabs.appendChild(b);
  }
}

function renderMeta() {
  const meta = $("meta");
  meta.innerHTML = "";
  for (const p of PLATFORMS) {
    const info = state[p];
    const d = document.createElement("div");
    d.className = "m";
    if (info && info.exists) {
      const date = new Date(info.updatedAt).toLocaleString("vi-VN");
      d.innerHTML = `<b>${p}</b><br>${info.cookieCount} cookie · ${info.domains.join(", ")}<br>cập nhật: ${date}`;
    } else {
      d.innerHTML = `<b>${p}</b><br>chưa có cookie`;
    }
    meta.appendChild(d);
  }
}

function showStatus(msg, ok) {
  const s = $("status");
  s.className = "status " + (ok ? "ok" : "err");
  s.textContent = msg;
}

async function refresh() {
  const r = await fetch("/api/cookies");
  const data = await r.json();
  state = {};
  for (const p of data.platforms) state[p.platform] = p;
  renderTabs();
  renderMeta();
}

$("saveBtn").onclick = async () => {
  const content = $("cookieInput").value.trim();
  if (!content) return showStatus("Chưa có nội dung cookie để lưu.", false);
  try {
    const r = await fetch("/api/cookies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: current, content }),
    });
    const data = await r.json();
    if (!r.ok) return showStatus(data.error || "Lỗi không xác định", false);
    showStatus(`Đã lưu ${data.saved.cookieCount} cookie cho ${current}.`, true);
    $("cookieInput").value = "";
    await refresh();
  } catch (e) {
    showStatus("Lỗi: " + e.message, false);
  }
};

$("clearBtn").onclick = () => { $("cookieInput").value = ""; showStatus("Đã xóa ô nhập.", true); };

$("deleteBtn").onclick = async () => {
  if (!confirm(`Xóa cookie đã lưu của ${current}?`)) return;
  const r = await fetch(`/api/cookies?platform=${current}`, { method: "DELETE" });
  const data = await r.json();
  if (!r.ok) return showStatus(data.error || "Lỗi xóa", false);
  showStatus(`Đã xóa cookie ${current}.`, true);
  await refresh();
};

refresh();
