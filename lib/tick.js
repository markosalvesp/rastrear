// Um "tick": rastreia presença, monta os avisos (presença + eventos + boss) e
// joga na FILA, que escoa respeitando o limite do Telegram. Chamado pelo cron.
import { getStore } from "@netlify/blobs";
import { pollOnce } from "./presence-store.js";
import { hasToken, sendMessage } from "./telegram.js";
import { loadChats, bossChats } from "./subs-store.js";
import { buildPresence, buildEvents } from "./notify-events.js";
import { enqueue } from "./queue.js";
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
  let i = 0;
  while (i < msgs.length && Date.now() - started < budgetMs) {
    const wave = msgs.slice(i, i + 25);
    await Promise.all(wave.map((m) => sendMessage(m.chat, m.text)));
    i += wave.length;
    if (i < msgs.length) await sleep(1000);
  }
  return msgs.slice(i); // excedente (só em evento em massa)
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

// Trava ATÔMICA: grava lastTick só se o etag não mudou (onlyIfMatch). Se dois ticks
// disparam ao mesmo tempo (cron duplicado), só UM ganha a escrita -> o outro pula.
async function claimTick(now) {
  const store = metaStore();
  let cur = 0, etag;
  try { const e = await store.getWithMetadata("lastTick", { type: "json" }); cur = e?.data?.at || 0; etag = e?.etag; } catch {}
  if (now - cur < MIN_GAP_MS) return false; // muito recente
  try {
    const res = await store.set("lastTick", JSON.stringify({ at: now }), etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    return res?.modified !== false; // false = outra invocação escreveu primeiro
  } catch {
    try { await store.setJSON("lastTick", { at: now }); } catch {}
    return true; // condicional indisponível: melhor deixar passar do que travar tudo
  }
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

  const { liveCount, connects, disconnects } = await pollOnce();
  if (hasToken()) {
    try {
      const chats = await loadChats();
      const msgs = [
        ...buildPresence(chats, connects, disconnects),
        ...(await buildEvents(chats)),
        ...(await buildBoss(chats)),
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
