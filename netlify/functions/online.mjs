// Status online de vários nicks de uma vez (para os "bonecos" salvos).
// Rota: /api/online?nicks=a,b,c
import { loadState, getPresenceFrom } from "../../lib/presence-store.js";

export default async (req) => {
  const url = new URL(req.url);
  const list = (url.searchParams.get("nicks") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let state;
  try {
    state = await loadState();
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }

  const players = {};
  for (const nick of list) {
    const p = getPresenceFrom(state, nick);
    players[nick] = {
      onlineNow: p.onlineNow,
      since: p.since,
      sinceExact: p.sinceExact,
      lastDisconnect: p.lastDisconnect,
    };
  }

  return Response.json({
    liveCount: state.liveCount || 0,
    lastPoll: state.lastPoll || 0,
    trackingSince: state.startedTracking || null,
    players,
  });
};

export const config = { path: "/api/online" };
