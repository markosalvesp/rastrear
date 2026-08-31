// Um "tick": rastreia presença, monta os avisos (presença + eventos + boss) e
// joga na FILA, que escoa respeitando o limite do Telegram. Chamado pelo cron.
import { getStore } from "@netlify/blobs";
import { pollOnce } from "./presence-store.js";
import { hasToken } from "./telegram.js";
import { loadChats, bossChats } from "./subs-store.js";
import { buildPresence, buildEvents } from "./notify-events.js";
import { enqueue } from "./queue.js";
import { brNow } from "./brdate.js";
import { dueAlerts } from "./bosses.js";

const MIN_GAP_MS = 45_000;

// dispara a background function que escoa a fila a ~25/seg (assíncrono)
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

async function lastTick() {
  try { return (await getStore("meta").get("lastTick", { type: "json" }))?.at || 0; }
  catch { return 0; }
}
async function markTick(at) {
  try { await getStore("meta").setJSON("lastTick", { at }); } catch {}
}

// Avisos de boss (5 e 1 min antes) -> lista de mensagens {chat, text}. Dedup por dia.
async function buildBoss(chats) {
  const now = brNow();
  const alerts = dueAlerts(now.minuteOfDay);
  if (!alerts.length) return [];
  const chatIds = bossChats(chats);
  if (!chatIds.length) return [];

  let sent;
  try { sent = await getStore("meta").get("bossSent", { type: "json" }); } catch { sent = null; }
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
  if (changed) { try { await getStore("meta").setJSON("bossSent", sent); } catch {} }
  return out;
}

export async function runTick() {
  const now = Date.now();
  if (now - (await lastTick()) < MIN_GAP_MS) return { skipped: true };
  await markTick(now);

  const { liveCount, connects, disconnects } = await pollOnce();
  if (hasToken()) {
    try {
      const chats = await loadChats();
      const msgs = [
        ...buildPresence(chats, connects, disconnects),
        ...(await buildEvents(chats)),
        ...(await buildBoss(chats)),
      ];
      if (msgs.length) await enqueue(msgs); // guarda ANTES de enviar -> não perde
      await triggerDrain(); // a background function escoa a fila a ~25/seg
    } catch (e) { console.error("tick avisos:", e.message); }
  }
  return { liveCount };
}
