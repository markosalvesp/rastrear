// Cliente mínimo da API do Telegram Bot.
// Token vem de process.env.TELEGRAM_BOT_TOKEN (local: .env | Netlify: env vars).

// Lê o token na hora do uso (o .env pode ser carregado depois deste módulo).
const token = () => process.env.TELEGRAM_BOT_TOKEN || "";

export const hasToken = () => !!token();

async function call(method, params = {}) {
  const t = token();
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN não configurado.");
  const res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
  return data.result;
}

// Retorna true se enviou, false se falhou (pra decidir se avança o marcador).
// Tenta algumas vezes pra vencer falhas de rede transitórias.
export async function sendMessage(chatId, text, extra = {}) {
  const params = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await call("sendMessage", params);
      return true;
    } catch (e) {
      if (attempt === 3) { console.error("sendMessage falhou:", e.message); return false; }
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  return false;
}

export function getUpdates(offset, timeout = 25) {
  return call("getUpdates", { offset, timeout, allowed_updates: ["message"] });
}

export function getMe() {
  return call("getMe");
}

// Remove o webhook (necessário pra usar long polling local).
export function deleteWebhook() {
  return call("deleteWebhook").catch(() => {});
}
