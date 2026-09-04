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
  if (!data.ok) {
    const error = new Error(`Telegram ${method}: ${data.description || res.status}`);
    error.status = res.status;
    error.errorCode = data.error_code;
    error.retryAfter = data.parameters?.retry_after;
    throw error;
  }
  return data.result;
}

// Retorna true se enviou, false se falhou (pra decidir se avança o marcador).
// Só repete quando o Telegram respondeu explicitamente 429 (não entregou).
// Em erro de rede a entrega é ambígua; repetir poderia criar uma cópia idêntica.
export async function sendMessage(chatId, text, extra = {}) {
  const params = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await call("sendMessage", params);
      return true;
    } catch (e) {
      const rateLimited = e?.errorCode === 429;
      if (!rateLimited || attempt === 3) {
        console.error("sendMessage falhou:", e.message);
        return false;
      }
      const waitMs = Math.max(1, Number(e.retryAfter) || attempt) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
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
