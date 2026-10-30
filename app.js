const $ = (selector) => document.querySelector(selector);
let memories = [];
let generated = "";
let editingId = null;
let toastTimer;

function toast(message) {
  const node = $("#toast"); node.textContent = message; node.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function selectedIds() { return [...document.querySelectorAll(".memory-select:checked")].map((box) => box.dataset.id); }
function updateSelection() {
  const n = selectedIds().length;
  $("#selected-count").textContent = `${n} ${n === 1 ? "memory" : "memories"} selected`;
  $("#illuminate").disabled = n === 0;
}
function render() {
  $("#memory-count").textContent = `${memories.length} ${memories.length === 1 ? "note" : "notes"}`;
  if (!memories.length) {
    $("#memory-list").innerHTML = '<div class="empty-state"><strong>Space for a first memory.</strong>Start with one small thing you hope to remember.</div>';
  } else {
    $("#memory-list").innerHTML = memories.map((m) => `<article class="memory-card">
      <input class="memory-select" type="checkbox" aria-label="Include ${esc(m.title)}" data-id="${esc(m.id)}">
      <div><h3 class="memory-title">${esc(m.title)}</h3><div class="memory-meta">${esc(m.person)} · ${esc(m.date || "A moment remembered")}</div><p class="memory-story">${esc(m.story)}</p></div>
      <div class="memory-actions">${m.sample ? '<span class="sample-badge">sample</span>' : ""}<button class="edit-button" type="button" aria-label="Edit ${esc(m.title)}" data-edit="${esc(m.id)}">edit</button><button class="delete-button" type="button" aria-label="Delete ${esc(m.title)}" data-delete="${esc(m.id)}">×</button></div>
    </article>`).join("");
  }
  document.querySelectorAll(".memory-select").forEach((box) => box.addEventListener("change", (event) => {
    event.currentTarget.closest(".memory-card").classList.toggle("selected", event.currentTarget.checked); updateSelection();
  }));
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Delete this memory from this device?")) return;
    const response = await fetch(`/api/memories/${encodeURIComponent(button.dataset.delete)}`, {method:"DELETE"});
    if (response.ok) { memories = memories.filter((m) => m.id !== button.dataset.delete); render(); toast("Memory removed from this device."); }
  }));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
    const m = memories.find((item) => item.id === button.dataset.edit); if (!m) return;
    editingId = m.id; const form = $("#memory-form");
    for (const field of ["person", "title", "story", "details"]) form.elements[field].value = m[field] || "";
    $(".dialog-head .eyebrow").textContent = "TEND TO A SAVED MEMORY";
    $(".dialog-head h2").textContent = "Change the details, as you remember them.";
    $(".save-button").innerHTML = 'Save your changes <span>✦</span>';
    $("#form-error").textContent = ""; $("#memory-dialog").showModal();
  }));
  updateSelection();
}
async function load() {
  try {
    const [items, status] = await Promise.all([fetch("/api/memories"), fetch("/api/status")]);
    memories = await items.json(); render();
    const model = await status.json();
    const statusBox = $("#model-status");
    if (model.gemma) {
      statusBox.className = "model-status ready"; statusBox.innerHTML = '<span class="status-dot"></span><span>Gemma is ready, right here on this device</span>';
      $("#connection-label").textContent = "Local Gemma connected";
    } else if (model.ollama) {
      statusBox.className = "model-status offline"; statusBox.innerHTML = '<span class="status-dot"></span><span>Ollama is running · install Gemma 3 to write</span>';
      $("#connection-label").textContent = "Private local AI";
    } else {
      statusBox.className = "model-status offline"; statusBox.innerHTML = '<span class="status-dot"></span><span>Start Ollama + Gemma 3 for local AI writing</span>';
      $("#connection-label").textContent = "Local keepsake mode";
    }
  } catch { toast("Memory Lantern couldn't reach its local server."); }
}
$("#add-memory").addEventListener("click", () => {
  editingId = null; $("#memory-form").reset(); $("#form-error").textContent = "";
  $(".dialog-head .eyebrow").textContent = "ADD TO THE KEEPSAKE BOX";
  $(".dialog-head h2").textContent = "A small thing worth keeping.";
  $(".save-button").innerHTML = 'Save this memory <span>✦</span>';
  $("#memory-dialog").showModal();
});
$("#close-dialog").addEventListener("click", () => $("#memory-dialog").close());
$("#memory-dialog").addEventListener("click", (event) => { if (event.target === $("#memory-dialog")) $("#memory-dialog").close(); });
$("#memory-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
  $("#form-error").textContent = "";
  try {
    const response = await fetch(editingId ? `/api/memories/${encodeURIComponent(editingId)}` : "/api/memories", {method:editingId ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(values)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't save this memory.");
    if (editingId) { memories = memories.map((m) => m.id === editingId ? data : m); toast("The memory is updated."); }
    else { memories.unshift(data); toast("A little thing, kept safe."); }
    render(); form.reset(); editingId = null; $("#memory-dialog").close();
  } catch (error) { $("#form-error").textContent = error.message; }
});
$("#select-all").addEventListener("click", () => {
  const boxes = [...document.querySelectorAll(".memory-select")];
  const shouldCheck = boxes.some((box) => !box.checked);
  boxes.forEach((box) => { box.checked = shouldCheck; box.closest(".memory-card").classList.toggle("selected", shouldCheck); }); updateSelection();
  $("#select-all").textContent = shouldCheck ? "Clear selection" : "Select all";
});
$("#illuminate").addEventListener("click", async (event) => {
  const button = event.currentTarget; button.disabled = true; button.innerHTML = '<span>✦</span> Gathering the light…';
  try {
    const response = await fetch("/api/illuminate", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ids:selectedIds()})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "The lantern could not light just now.");
    generated = data.text; $("#result-text").textContent = generated;
    $("#result-sources").textContent = "Grounded in: " + data.sources.map((s) => `${s.person} — ${s.title}`).join(" · ");
    $("#result-wrap").hidden = false; $("#result-wrap").scrollIntoView({behavior:"smooth", block:"nearest"});
  } catch (error) { toast(error.message); }
  finally { button.disabled = selectedIds().length === 0; button.innerHTML = '<span>✦</span> Light the lantern'; }
});
$("#copy-result").addEventListener("click", async () => { await navigator.clipboard.writeText(generated); toast("Remembrance copied."); });
$("#export-result").addEventListener("click", () => {
  const text = generated.split("\nSOURCES:")[0].trim();
  const sourceNames = selectedIds().map((id) => memories.find((m) => m.id === id)).filter(Boolean).map((m) => `${m.person} — ${m.title}`);
  const doc = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>A remembrance to keep</title><style>body{max-width:680px;margin:12vh auto;padding:30px;background:#f5f0e6;color:#3b3028;font:18px/1.8 Georgia,serif}h1{font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#9a674f}blockquote{margin:35px 0;padding-left:22px;border-left:2px solid #c68b55}footer{font:12px/1.6 system-ui;color:#817568}</style><h1>✳ A remembrance to keep</h1><blockquote>${esc(text).replace(/\n/g,"<br>")}</blockquote><footer>Made from saved memories: ${esc(sourceNames.join(" · "))}<br>Kept here, by you. ✿</footer></html>`;
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([doc], {type:"text/html"})); link.download = "a-remembrance-to-keep.html"; link.click(); URL.revokeObjectURL(link.href);
});
load();
