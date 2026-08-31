// Um "tick": rastreia presença + avisa + varre eventos + avisa bosses.
// Chamado pelo agendador do Netlify e pelo cron externo. A trava evita rodar
// duas vezes no mesmo minuto (um trigger cobre o outro se falhar).
import { getStore } from "@netlify/blobs";
import { pollOnce } from "./presence-store.js";
import { hasToken, sendMessage } from "./telegram.js";
import { loadChats, bossChats } from "./subs-store.js";
import { notifyPresence, runEventChecks } from "./notify-events.js";
import { brNow } from "./brdate.js";
import { dueAlerts } from "./bosses.js";

const MIN_GAP_MS = 45_000;

async function lastTick() {
  try { return (await getStore("meta").get("lastTick", { type: "json" }))?.at || 0; }
  catch { return 0; }
}
async function markTick(at) {
  try { await getStore("meta").setJSON("lastTick", { at }); } catch {}
}

// Avisos de boss (5 e 1 min antes), com dedup por dia.
async function bossAlerts(chats) {
  const now = brNow();
  const alerts = dueAlerts(now.minuteOfDay);
  if (!alerts.length) return;
  const chatIds = bossChats(chats);
  if (!chatIds.length) return;

  let sent;
  try { sent = await getStore("meta").get("bossSent", { type: "json" }); } catch { sent = null; }
  if (!sent || sent.date !== now.dateStr) sent = { date: now.dateStr, keys: {} };

  let changed = false;
  for (const a of alerts) {
    const key = `${a.name}:${a.time}:${a.lead}`;
    if (sent.keys[key]) continue;
    sent.keys[key] = true;
    changed = true;
    const txt = `🐉 <b>${a.name}</b> vai nascer em <b>${a.local}</b> em <b>${a.lead} minuto${a.lead > 1 ? "s" : ""}</b>!`;
    for (const c of chatIds) await sendMessage(c, txt);
  }
  if (changed) { try { await getStore("meta").setJSON("bossSent", sent); } catch {} }
}

export async function runTick() {
  const now = Date.now();
  if (now - (await lastTick()) < MIN_GAP_MS) return { skipped: true };
  await markTick(now);

  const { liveCount, connects, disconnects } = await pollOnce();
  if (hasToken()) {
    try {
      const chats = await loadChats();
      if (connects.length || disconnects.length) await notifyPresence(chats, connects, disconnects);
      await runEventChecks();
      await bossAlerts(chats);
    } catch (e) { console.error("tick avisos:", e.message); }
  }
  return { liveCount };
}
