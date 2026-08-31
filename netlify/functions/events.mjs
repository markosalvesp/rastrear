// Função AGENDADA (a cada 1 min): varre drops/mortes dos bonecos seguidos e
// avisa no Telegram. Separada da presença pra cada uma ter seu próprio tempo.
import { hasToken } from "../../lib/telegram.js";
import { runEventChecks } from "../../lib/notify-events.js";

export default async () => {
  if (!hasToken()) return new Response("sem token");
  try {
    const { checked } = await runEventChecks();
    return new Response(`ok: ${checked} bonecos checados`);
  } catch (e) {
    console.error("events falhou:", e.message);
    return new Response("erro: " + e.message, { status: 500 });
  }
};

export const config = { schedule: "* * * * *" };
