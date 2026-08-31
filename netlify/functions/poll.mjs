// Função AGENDADA (a cada 1 min): rastreia presença 24/7 e avisa conexões/desconexões.
// (A varredura de drops/mortes fica na função events.mjs, pra não competir por tempo.)
import { pollOnce } from "../../lib/presence-store.js";
import { hasToken } from "../../lib/telegram.js";
import { loadChats } from "../../lib/subs-store.js";
import { notifyPresence } from "../../lib/notify-events.js";

export default async () => {
  const { liveCount, connects, disconnects } = await pollOnce();
  if (hasToken() && (connects.length || disconnects.length)) {
    try {
      await notifyPresence(await loadChats(), connects, disconnects);
    } catch (e) { console.error("avisos de presença:", e.message); }
  }
  return new Response(`ok: ${liveCount} online`);
};

export const config = { schedule: "* * * * *" };
