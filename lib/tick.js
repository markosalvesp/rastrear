// Um "tick": rastreia presença, monta os avisos (presença + eventos + boss) e
// joga na FILA, que escoa respeitando o limite do Telegram. Chamado pelo cron.
import { getStore } from "@netlify/blobs";
import { pollOnce } from "./presence-store.js";
import { hasToken, sendMessage } from "./telegram.js";
import { loadChats, bossChats } from "./subs-store.js";
import { buildPresence, buildEvents } from "./notify-events.js";
import { enqueue, drainQueue } from "./queue.js";
import { brNow } from "./brdate.js";
import { dueAlerts } from "./bosses.js";

const MIN_GAP_MS = 45_000;
const DRAIN_BUDGET_MS = 5000; // tempo de envio por tick (a função tem ~10s)

async function lastTick() {
  try { return (await getStore("meta").get("lastTick", { type: "json" }))?.at || 0; }
  catch { return 0; }
}
async function markTick(at) {
  try { await getStore("meta").setJSON("lastTick", { at }); } catch {}
}

// Avisos de boss (5 e 1 min antes). Se houver CANAL configurado, posta 1 vez lá
// (INSTANTÂNEO pra todos). Senão, cai no modo DM (via fila) pros /boss.
async function buildBoss(chats) {
  const now = brNow();
  const alerts = dueAlerts(now.minuteOfDay);
  if (!alerts.length) return [];
  const channel = process.env.CHANNEL_ID; // ex: @bossdestiny ou -1001234567890

  let sent;
  try { sent = await getStore("meta").get("bossSent", { type: "json" }); } catch { sent = null; }
  if (!sent || sent.date !== now.dateStr) sent = { date: now.dateStr, keys: {} };

  const out = [];
  const dmChats = channel ? [] : bossChats(chats); // sem canal -> DM
  let changed = false;
  for (const a of alerts) {
    const k = `${a.name}:${a.time}:${a.lead}`;
    if (sent.keys[k]) continue;
    sent.keys[k] = true;
    changed = true;
    const text = `🐉 <b>${a.name}</b> vai nascer em <b>${a.local}</b> em <b>${a.lead} minuto${a.lead > 1 ? "s" : ""}</b>!`;
    if (channel) await sendMessage(channel, text); // 1 post = todos, na hora
    else for (const c of dmChats) out.push({ chat: c, text });
  }
  if (changed) { try { await getStore("meta").setJSON("bossSent", sent); } catch {} }
  return out; // vazio quando usa canal
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
      await drainQueue(DRAIN_BUDGET_MS); // escoa o que der; o resto vai no próximo tick
    } catch (e) { console.error("tick avisos:", e.message); }
  }
  return { liveCount };
}
