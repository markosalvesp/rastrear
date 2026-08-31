// Gatilho HTTP pro cron externo (cron-job.org) chamar todo minuto.
// Protegido por ?key=<CRON_SECRET>. Rota: /api/tick
import { runTick } from "../../lib/tick.js";

export default async (req) => {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const r = await runTick();
  return new Response(r.skipped ? "skip" : `ok: ${r.liveCount} online`);
};

export const config = { path: "/api/tick" };
