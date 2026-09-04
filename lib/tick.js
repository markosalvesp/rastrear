// Um "tick": rastreia presença, monta os avisos (presença + eventos + boss) e
// joga na FILA, que escoa respeitando o limite do Telegram. Chamado pelo cron.
import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { pollOnce } from "./presence-store.js";
import { hasToken, sendMessage } from "./telegram.js";
import { loadChats, bossChats } from "./subs-store.js";
import { buildPresence, buildEvents } from "./notify-events.js";
import { enqueue, migrateLegacyQueue } from "./queue.js";
import { brNow } from "./brdate.js";
import { dueAlerts } from "./bosses.js";

const MIN_GAP_MS = 45_000;
const FLUSH_MS = 4000; // tempo pra enviar DIRETO no tick (o resto vai pra fila/background)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// lastTick e bossSent são marcadores de deduplicação e não podem ser lidos do
// cache eventual no minuto seguinte à escrita.
const metaStore = () => getStore({ name: "meta", consistency: "strong" });

// Envia DIRETO (imediato) a ~25/seg dentro do orçamento; devolve o que sobrar (excedente).
async function flushDirect(msgs, budgetMs) {
  const started = Date.now();
  let pending = [...msgs];
  while (pending.length && Date.now() - started < budgetMs) {
    const wave = [], rest = [], used = new Set();
    for (const message of pending) {
      const chat = String(message.chat);
      if (wave.length < 25 && !used.has(chat)) { wave.push(message); used.add(chat); }
      else rest.push(message);
    }
    await Promise.all(wave.map((m) => sendMessage(m.chat, m.text)));
    pending = rest;
    if (pending.length) await sleep(1000);
  }
  return pending;
}

// dispara a background function que escoa a fila a ~25/seg (assíncrono) — só pro excedente
async function triggerDrain() {
  const base = process.env.URL || "https://rastreadordestiny.netlify.app";
  const key = process.env.CRON_SECRET || "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(`${base}/.netlify/functions/drain-background?key=${encodeURIComponent(key)}`, { method: "POST", signal: ctrl.signal });
  } catch {}
  finally { clearTimeout(t); }
}

// Eleição do tick: leitura forte + confirmação do dono depois da escrita. A
// versão instalada de Blobs ignora opções condicionais, então não fingimos CAS.
async function claimTick(now) {
  const store = metaStore();
  const current = await store.get("lastTick", { type: "json" });
  const cur = current?.at || 0;
  if (now - cur < MIN_GAP_MS) return false; // muito recente
  const owner = randomUUID();
  await store.setJSON("lastTick", { at: now, owner });
  await sleep(250);
  const confirmed = await store.get("lastTick", { type: "json" });
  return confirmed?.owner === owner;
}

// Avisos de boss (5 e 1 min antes) -> lista de mensagens {chat, text}. Dedup por dia.
async function buildBoss(chats) {
  const now = brNow();
  const alerts = dueAlerts(now.minuteOfDay);
  if (!alerts.length) return [];
  const chatIds = bossChats(chats);
  if (!chatIds.length) return [];

  let sent;
  try { sent = await metaStore().get("bossSent", { type: "json" }); } catch { sent = null; }
  if (!sent || sent.date !== now.dateStr) sent = { date: now.dateStr, keys: {} };

  const out = [];
  let changed = false;
  for (const a of alerts) {
    const k = `${a.name}:${a.time}:${a.lead}`;
    if (sent.keys[k]) continue;
    sent.keys[k] = true;
    changed = true;
    const text = `🐉 <b>${a.name}</b> vai nascer em <b>${a.local}</b> em <b>${a.lead} minuto${a.lead > 1 ? "s" : ""}</b>!`;
    for (const c of chatIds) out.push({ chat: c, text });
  }
  if (changed) { try { await metaStore().setJSON("bossSent", sent); } catch {} }
  return out;
}

export async function runTick() {
  if (!(await claimTick(Date.now()))) return { skipped: true };

  // Uma única vez após este deploy: arquiva e invalida o array antigo, que pode
  // conter avisos já atrasados. As inscrições ficam em outro store e não mudam.
  try { await migrateLegacyQueue(); }
  catch (e) { console.error("queue migration:", e.message); }

  const { liveCount, connects, disconnects } = await pollOnce();
  if (hasToken()) {
    try {
      const chats = await loadChats();
      // Boss é sensível ao horário e tem prioridade no envio direto.
      const boss = await buildBoss(chats);
      const msgs = [
        ...boss,
        ...buildPresence(chats, connects, disconnects),
        ...(await buildEvents(chats)),
      ];
      if (msgs.length) {
        // envia DIRETO (na hora) o que der; só o excedente (evento em massa) vai pra fila
        const overflow = await flushDirect(msgs, FLUSH_MS);
        if (overflow.length) { await enqueue(overflow); await triggerDrain(); }
      }
    } catch (e) { console.error("tick avisos:", e.message); }
  }
  return { liveCount };
}
