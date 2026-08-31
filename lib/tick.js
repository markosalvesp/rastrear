// Um "tick": rastreia presença + avisa + varre eventos. Chamado tanto pelo
// agendador do Netlify quanto pelo cron externo (cron-job.org). A trava evita
// rodar duas vezes no mesmo minuto (um trigger cobre o outro se falhar).
import { getStore } from "@netlify/blobs";
import { pollOnce } from "./presence-store.js";
import { hasToken } from "./telegram.js";
import { loadChats } from "./subs-store.js";
import { notifyPresence, runEventChecks } from "./notify-events.js";

const MIN_GAP_MS = 45_000; // no máx. um tick a cada 45s

async function lastTick() {
  try { return (await getStore("meta").get("lastTick", { type: "json" }))?.at || 0; }
  catch { return 0; }
}
async function markTick(at) {
  try { await getStore("meta").setJSON("lastTick", { at }); } catch {}
}

export async function runTick() {
  const now = Date.now();
  if (now - (await lastTick()) < MIN_GAP_MS) return { skipped: true };
  await markTick(now);

  const { liveCount, connects, disconnects } = await pollOnce();
  if (hasToken()) {
    try {
      if (connects.length || disconnects.length) {
        await notifyPresence(await loadChats(), connects, disconnects);
      }
      await runEventChecks();
    } catch (e) { console.error("tick avisos:", e.message); }
  }
  return { liveCount };
}
