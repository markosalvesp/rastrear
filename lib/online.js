// Lista de personagens online do Destiny Tale.
// Fonte: server function `ZP()` do site -> GET /_serverFn/<hash> (headers especiais).
// Retorna { nicks:[...normalizados], cache }. O site atualiza ~a cada 30s.
import { getServerFn } from "./fetcher.js";

const ONLINE_FN_HASH =
  "ed7cacc590f89494eef230da1ac119e03cbc9b7852ff4fca8b88f56b9af02878";

export const normNick = (s) => String(s || "").trim().toLowerCase();

// Converte um nó-objeto do formato seroval ({p:{k:[...],v:[...]}}) em um mapa chave->nó.
function serovalObj(node) {
  const out = {};
  if (node && node.p && Array.isArray(node.p.k)) {
    node.p.k.forEach((key, i) => (out[key] = node.p.v[i]));
  }
  return out;
}

/**
 * Busca a lista de nicks online.
 * @returns {Promise<{ nicks: string[], count: number, updatedAt: number }>}
 */
export async function fetchOnlineNicks() {
  const text = await getServerFn(ONLINE_FN_HASH);
  const root = JSON.parse(text);
  const top = serovalObj(root); // { result, error, context }
  const result = serovalObj(top.result); // { updated_at, count, nicks, cache, unavailable }

  const nicksNode = result.nicks;
  const nicks =
    nicksNode && Array.isArray(nicksNode.a)
      ? nicksNode.a.map((n) => n.s).filter(Boolean)
      : [];

  return {
    nicks,
    count: result.count?.s ?? nicks.length,
    updatedAt: (result.updated_at?.s ?? 0) * 1000, // segundos -> ms
  };
}
