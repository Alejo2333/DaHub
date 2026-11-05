import { lazy } from "react";
import type { GameModule } from "../../types/game";
import { bestFloor } from "../../stores/app";
const cover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d1560"/><stop offset="1" stop-color="#14061f"/></linearGradient><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d11f4b"/><stop offset="1" stop-color="#5a0a22"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c8892b"/></linearGradient></defs><rect width="320" height="240" fill="url(#b)"/><text x="160" y="42" fill="#fff4d6" font-family="Georgia,serif" font-size="30" font-weight="700" letter-spacing="3" text-anchor="middle">FERMIL GAMBLE</text><rect x="62" y="60" width="196" height="150" rx="14" fill="url(#c)" stroke="url(#g)" stroke-width="5"/><rect x="78" y="82" width="164" height="72" rx="7" fill="#fff9e9" stroke="#2c0612" stroke-width="3"/><path d="M132 82V154M188 82V154" stroke="#2c0612" stroke-opacity=".3" stroke-width="2"/><g font-size="38" text-anchor="middle"><text x="105" y="132">🍒</text><text x="160" y="132">7️⃣</text><text x="215" y="132">💎</text></g><rect x="100" y="170" width="120" height="24" rx="5" fill="#1a0713" stroke="#a8791c" stroke-width="2"/><text x="160" y="187" fill="#ffc94a" font-family="Georgia,serif" font-size="14" text-anchor="middle">DEBT DUE 2,000</text><rect x="264" y="92" width="8" height="58" rx="4" fill="#c9c9d6"/><circle cx="268" cy="86" r="11" fill="#ff4d6d" stroke="#7c1230" stroke-width="2"/><g><circle cx="42" cy="212" r="17" fill="#c8123a" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/><circle cx="24" cy="186" r="11" fill="#1d6fd8" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/><circle cx="288" cy="210" r="15" fill="#0f8c50" stroke="#fff" stroke-width="3" stroke-dasharray="5 5"/></g></svg>`,
  );
const game: GameModule = {
  id: "lucky-debt",
  title: "GAMBLING WITH FERMIL",
  tagline:
    "Pay off the casino debt together. One bad spin sinks the whole team.",
  cover,
  minPlayers: 1,
  maxPlayers: 6,
  category: "Casino",
  tags: ["Co-op", "Multiplayer", "Fictional chips"],
  description:
    "You owe the house. Walk the casino floor with your friends, bet from one shared wallet across five machines, and pay what is due before the debt collector reaches you.",
  howTo: [
    "Everyone bets from the same chips, so one reckless all-in hits the whole team.",
    "Pay the debt before the clock runs out. Pay early and leftover seconds become bonus chips.",
    "Spend winnings on upgrades between floors. Every floor's debt is 50% bigger than the last.",
  ],
  controls: [
    "WASD, arrow keys, or click to walk",
    "E or click a machine to play",
    "Esc to step away from a machine",
  ],
  notice:
    "Fictional chips only. They have no cash value and cannot be bought or redeemed.",
  best: () => {
    const n = bestFloor();
    return n > 0 ? `Your best: floor ${n}` : null;
  },
  Component: lazy(() => import("./ui/LuckyDebt")),
};
export default game;
