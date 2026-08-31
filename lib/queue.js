// Fila de envio persistente (Netlify Blobs) — para aguentar evento em massa
// sem estourar o limite do Telegram (30 msg/s global, 1 msg/s por chat).
// Escoa em ondas de até 25 chats DISTINTOS, com 1s entre ondas (~25/s).
import { getStore } from "@netlify/blobs";
import { sendMessage } from "./telegram.js";

const KEY = "pending";
const MAX = 5000; // teto da fila (evita crescer sem limite)
const WAVE = 25; // mensagens por onda (< 30/s do Telegram)
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

// Monta uma onda de até `size` mensagens com chats distintos (respeita 1 msg/s por chat).
export function buildWave(q, size) {
  const idx = [];
  const used = new Set();
  for (let j = 0; j < q.length && idx.length < size; j++) {
    if (!used.has(q[j].chat)) { used.add(q[j].chat); idx.push(j); }
  }
  return idx;
}

// Envia o que der dentro do orçamento de tempo; guarda o resto pro próximo tick.
export async function drainQueue(budgetMs) {
  let q = await loadQueue();
  if (!q.length) return { sent: 0, left: 0 };
  const started = Date.now();
  let sent = 0;
  while (q.length && Date.now() - started < budgetMs) {
    const idx = buildWave(q, WAVE);
    await Promise.all(idx.map((j) => sendMessage(q[j].chat, q[j].text)));
    const ws = new Set(idx);
    q = q.filter((_, j) => !ws.has(j)); // remove os tentados (sendMessage já tem retry)
    sent += idx.length;
    if (q.length) await sleep(1000); // respeita ~25/s
  }
  await saveQueue(q);
  return { sent, left: q.length };
}
