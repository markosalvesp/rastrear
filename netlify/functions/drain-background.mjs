// BACKGROUND FUNCTION (nome termina em -background = roda até 15 min, assíncrono).
// Escoa a fila de envio a ~25/seg de forma contínua (sem o teto de 10s das funções normais).
import { drainAll } from "../../lib/queue.js";

export default async (req) => {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const r = await drainAll(14 * 60 * 1000); // até 14 min
  return new Response(JSON.stringify(r));
};
