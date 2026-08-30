// Função AGENDADA: roda a cada 1 minuto (mesmo sem visitantes) e registra
// quem conectou/desconectou. É o "rastreador 24/7" da versão hospedada.
import { pollOnce } from "../../lib/presence-store.js";

export default async () => {
  try {
    const { liveCount } = await pollOnce();
    return new Response(`ok: ${liveCount} online`);
  } catch (e) {
    console.error("poll agendado falhou:", e.message);
    return new Response("erro: " + e.message, { status: 500 });
  }
};

export const config = { schedule: "* * * * *" }; // a cada minuto
