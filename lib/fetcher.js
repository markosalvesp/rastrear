// Camada de acesso ao site destinytale.com.br
// - Headers realistas de navegador (senão o edge/anti-bot devolve 404)
// - Cache em memória com TTL (evita martelar o servidor e deixa rápido)
// - Fila global com intervalo mínimo entre requisições (throttle) + retry com backoff

const BASE = "https://www.destinytale.com.br";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
};

const CACHE_TTL_MS = 90_000; // 90s: o próprio site cacheia ~1min
// Local: 700ms entre requisições (gentil com o site). No Netlify: gap curto
// pra caber no limite de tempo da função (as requisições ainda são uma de cada vez).
const MIN_GAP_MS = process.env.NETLIFY ? 150 : 700;
const MAX_RETRIES = 3;

const cache = new Map(); // url -> { at, html }
let queue = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rawFetch(url, headers = HEADERS) {
  // respeita o intervalo mínimo global
  const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - Date.now());
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return await res.text();
      // 404/429/5xx: geralmente anti-bot/rate-limit intermitente -> backoff e tenta de novo
      lastErr = new Error(`HTTP ${res.status} em ${url}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < MAX_RETRIES) await sleep(attempt * 900);
  }
  throw lastErr;
}

// Enfileira para serializar as requisições (throttle global de verdade)
function enqueue(fn) {
  const run = queue.then(fn, fn);
  // evita que uma rejeição quebre a cadeia da fila
  queue = run.catch(() => {});
  return run;
}

/**
 * Busca uma página do site (com cache + throttle + retry).
 * @param {string} path  ex: "/rankings/pvp"
 * @param {object} params  querystring
 * @returns {Promise<string>} HTML
 */
export async function getPage(path, params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    )
  ).toString();
  const url = `${BASE}${path}${qs ? "?" + qs : ""}`;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.html;

  const html = await enqueue(() => rawFetch(url, HEADERS));
  cache.set(url, { at: Date.now(), html });
  return html;
}

// Chama um "server function" do TanStack Start (usado p/ a lista de online).
// Precisa dos headers x-tsr-serverfn / accept especiais, senão volta vazio.
const SERVERFN_HEADERS = {
  "User-Agent": HEADERS["User-Agent"],
  Accept: "application/x-tss-framed, application/x-ndjson, application/json",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "x-tsr-serverfn": "true",
};

export async function getServerFn(hash, payloadObj) {
  let url = `${BASE}/_serverFn/${hash}`;
  if (payloadObj !== undefined) {
    url += `?payload=${encodeURIComponent(JSON.stringify(payloadObj))}`;
  }
  return enqueue(() => rawFetch(url, SERVERFN_HEADERS));
}

export { BASE };
