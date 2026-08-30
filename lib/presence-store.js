// Armazenamento de presença no Netlify Blobs (histórico global de conexões).
// Usado pela função agendada (poll) e lido pela função do jogador.
// O site não guarda histórico de sessão — este store acumula a partir do 1º poll.
import { getStore } from "@netlify/blobs";
import { fetchOnlineNicks, normNick } from "./online.js";

const KEY = "state";
const MAX_SESSIONS = 15; // sessões guardadas por personagem
const PRUNE_OFFLINE_MS = 24 * 60 * 60 * 1000; // esquece offline há +24h

function store() {
  return getStore("presence");
}

export async function loadState() {
  try {
    const s = await store().get(KEY, { type: "json" });
    if (s && s.players) return s;
  } catch {
    /* primeira execução: sem estado ainda */
  }
  return { startedTracking: null, lastPoll: 0, liveCount: 0, players: {} };
}

export async function saveState(state) {
  await store().setJSON(KEY, state);
}

function newPlayer() {
  return { online: false, since: null, lastConnect: null, lastDisconnect: null, sessions: [] };
}

/**
 * Um ciclo de rastreamento: busca a lista de online e registra transições.
 * Retorna { liveCount }.
 */
export async function pollOnce() {
  const state = await loadState();
  const { nicks, updatedAt } = await fetchOnlineNicks();
  const now = Date.now();
  const firstPoll = !state.startedTracking;
  if (firstPoll) state.startedTracking = now;

  const online = new Set(nicks.map(normNick));

  // Conexões
  for (const nick of online) {
    const p = (state.players[nick] ||= newPlayer());
    if (!p.online) {
      p.online = true;
      p.since = now;
      const exact = !firstPoll; // no 1º poll não sabemos a hora exata
      if (exact) p.lastConnect = now;
      p.sessions.push({ connectedAt: now, disconnectedAt: null, sinceExact: exact });
      if (p.sessions.length > MAX_SESSIONS) p.sessions.shift();
    }
  }

  // Desconexões
  for (const [nick, p] of Object.entries(state.players)) {
    if (p.online && !online.has(nick)) {
      p.online = false;
      p.lastDisconnect = now;
      p.since = null;
      const s = p.sessions[p.sessions.length - 1];
      if (s && s.disconnectedAt == null) {
        s.disconnectedAt = now;
        s.durationSec = Math.round((now - s.connectedAt) / 1000);
      }
    }
  }

  // Poda: esquece offline antigo (mantém o blob pequeno)
  for (const [nick, p] of Object.entries(state.players)) {
    if (!p.online && p.lastDisconnect && now - p.lastDisconnect > PRUNE_OFFLINE_MS) {
      delete state.players[nick];
    }
  }

  state.lastPoll = now;
  state.liveCount = online.size;
  state.updatedAt = updatedAt;
  await saveState(state);
  return { liveCount: online.size };
}

/** Extrai a presença de um nick a partir de um `state` já carregado. */
export function getPresenceFrom(state, nick) {
  const key = normNick(nick);
  const p = state.players[key] || newPlayer();
  const last = p.sessions[p.sessions.length - 1];
  return {
    onlineNow: !!p.online,
    since: p.online ? p.since : null,
    sinceExact: p.online ? last?.sinceExact ?? false : null,
    lastConnect: p.lastConnect,
    lastDisconnect: p.lastDisconnect,
    sessions: [...p.sessions].reverse(),
    trackingSince: state.startedTracking,
    lastPoll: state.lastPoll,
    liveCount: state.liveCount,
  };
}
