// Fila de envio persistente (Netlify Blobs). Escoada por uma BACKGROUND FUNCTION
// que roda contínuo a ~25/seg (respeita o limite do Telegram de 30/seg).
import { getStore } from "@netlify/blobs";
import { sendMessage } from "./telegram.js";

const KEY = "pending";
const LOCK = "drainLock";
const MAX = 8000; // teto da fila
const WAVE = 25; // por onda/segundo (< 30/seg do Telegram)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function loadQueue() {
  try { return (await getStore("queue").get(KEY, { type: "json" })) || []; }
  catch { return []; }
}
async function saveQueue(q) {
  try { await getStore("queue").setJSON(KEY, q.slice(-MAX)); }
  catch (e) { console.error("saveQueue:", e.message); }
}
export async function enqueue(msgs) {
  if (!msgs || !msgs.length) return;
  const q = await loadQueue();
  q.push(...msgs);
  await saveQueue(q);
}

// Onda de até `size` mensagens com chats DISTINTOS (respeita 1 msg/seg por chat).
export function buildWave(q, size) {
  const idx = [], used = new Set();
  for (let j = 0; j < q.length && idx.length < size; j++)
    if (!used.has(q[j].chat)) { used.add(q[j].chat); idx.push(j); }
  return idx;
}

// trava simples por tempo (uma execução por vez)
async function lockActive() {
  try { const l = await getStore("meta").get(LOCK, { type: "json" }); return l && l.until > Date.now(); }
  catch { return false; }
}
async function setLock(untilMs) { try { await getStore("meta").setJSON(LOCK, { until: untilMs }); } catch {} }

// Escoa a fila a ~25/seg até esvaziar ou atingir maxMs. Só uma execução por vez.
export async function drainAll(maxMs) {
  if (await lockActive()) return { skipped: true };
  await setLock(Date.now() + maxMs + 30_000);
  const started = Date.now();
  let sent = 0;
  try {
    while (Date.now() - started < maxMs) {
      let q = await loadQueue();
      if (!q.length) break;
      const idx = buildWave(q, WAVE);
      await Promise.all(idx.map((j) => sendMessage(q[j].chat, q[j].text)));
      const ws = new Set(idx);
      q = q.filter((_, j) => !ws.has(j));
      await saveQueue(q);
      sent += idx.length;
      if (q.length) await sleep(1000); // ~25/seg
    }
  } finally { await setLock(0); }
  return { sent };
}
