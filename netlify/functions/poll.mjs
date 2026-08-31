// Agendador interno do Netlify (a cada 1 min) — chama o tick (com trava anti-duplicação).
import { runTick } from "../../lib/tick.js";

export default async () => {
  const r = await runTick();
  return new Response(r.skipped ? "skip" : `ok: ${r.liveCount} online`);
};

export const config = { schedule: "* * * * *" };
