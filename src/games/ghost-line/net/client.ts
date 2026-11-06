import { sendAction, sendToPeers } from "../../../multiplayer/party";
import type { ClientHooks } from "../../../types/game";
import type { Action, Move, Peer } from "../types";

export interface Sample {
  at: number;
  x: number;
  y: number;
  move: Move;
  p: number;
}
/** How far behind real time ghosts are shown, so there are always two samples to smooth between. */
export const GHOST_DELAY = 110;
const KEEP = 10,
  TELEPORT = 200;
/** Recent positions of the other runners. Not reactive: the scene reads it every frame. */
export const ghosts = new Map<string, Sample[]>();

export const sendFinish = () => sendAction<Action>({ t: "FINISH" });
export const sendPose = (x: number, y: number, move: Move, p: number) =>
  sendToPeers<Peer>({ t: "POSE", x, y, move, p });

/** Where a ghost should be drawn at this time, smoothed between the samples either side of it. */
export function ghostAt(list: Sample[], time: number): Sample | null {
  const last = list[list.length - 1];
  if (!last) return null;
  if (time >= last.at) return last;
  const i = list.findIndex((s) => s.at > time);
  const b = list[i]!,
    a = list[i - 1];
  if (!a || Math.abs(b.x - a.x) > TELEPORT) return b;
  const k = (time - a.at) / (b.at - a.at || 1);
  return {
    at: time,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    move: b.move,
    // A lower progress means the same move started again, like two handsprings in a row.
    p: a.move === b.move && b.p >= a.p ? a.p + (b.p - a.p) * k : b.p,
  };
}

export const client: ClientHooks<never, Peer> = {
  onStart: () => ghosts.clear(),
  onStop: () => ghosts.clear(),
  onPeer(from, m) {
    const list = ghosts.get(from) ?? [];
    list.push({ at: performance.now(), x: m.x, y: m.y, move: m.move, p: m.p });
    if (list.length > KEEP) list.shift();
    ghosts.set(from, list);
  },
  onPlayerLeave: (id) => void ghosts.delete(id),
};
