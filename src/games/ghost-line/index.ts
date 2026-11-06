import { lazy } from "react";
import type { GameModule, GameNet } from "../../types/game";
import { client } from "./net/client";
import { createHost } from "./net/host";
import { isAction, isPeer, isState } from "./net/validate";
import type { Action, Peer, RaceState } from "./types";

const net: GameNet<RaceState, Action, never, Peer> = {
  isState,
  isAction,
  isPeer,
  createHost,
  client,
};
const cover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1147"/><stop offset=".55" stop-color="#c2416c"/><stop offset="1" stop-color="#ff9a5a"/></linearGradient></defs><rect width="320" height="240" fill="url(#s)"/><circle cx="232" cy="118" r="44" fill="#ffd9a0" opacity=".85"/><path d="M0 170h40v-50h34v30h44v-40h30v60h60v-34h40v26h72v78H0z" fill="#37194f"/><path d="M0 240v-52h126v-14h36v14h22v52zM226 240v-64h94v64z" fill="#0e0718"/><g fill="none" stroke="#05020a" stroke-linecap="round" stroke-linejoin="round"><path d="M156 128l-16 12-12-6M156 128l16 6 2 16" stroke-width="7"/><path d="M162 92l-6 36" stroke-width="13"/><path d="M162 96l-16 10-10-8M162 96l18 6 12-10" stroke-width="5"/></g><circle cx="168" cy="78" r="9" fill="#05020a"/><path d="M162 88c-14 2-26-2-42 6" fill="none" stroke="#3de0d0" stroke-width="4" stroke-linecap="round"/><text x="160" y="36" fill="#fff4e6" font-family="Arial,sans-serif" font-size="30" font-weight="800" letter-spacing="3" text-anchor="middle">GHOST LINE</text></svg>`,
  );
const game: GameModule = {
  id: "ghost-line",
  title: "Ghost Line",
  tagline: "Race your friends' ghosts across the rooftops at dusk.",
  cover,
  minPlayers: 1,
  maxPlayers: 6,
  category: "Racing",
  tags: ["Multiplayer", "Parkour", "Race"],
  description:
    "Everyone runs the same rooftops at once, but you only see each other as ghosts. Time your jumps, vaults, climbs and slides to keep your flow and post the fastest time.",
  howTo: [
    "Your runner runs by itself. You only choose when to jump and when to slide.",
    "Press jump before a block to vault it, or before a wall to climb it.",
    "Slide under low bars and jump over live wires. Mistakes cost you speed, and a fall sends you back to the last checkpoint.",
    "Glowing zones on the ground mark the perfect moment. Press there for a trick and a burst of speed.",
    "Wide blocks give a Kong Vault, narrow ones a Dash Vault, walls a Wall Run, and bars a Power Slide.",
    "Roof edges give flips: Front, then Back, then a Double once your combo reaches 3. Big drops give a Swallow Dive, or a Triple Swallow on a combo of 3 or more. Live wires give a Back Handspring.",
    "Press slide just before a hard landing for a Speed Roll. Otherwise the landing slows you down.",
    "Tricks in a row build a combo, and each one adds more speed. Any mistake ends it.",
    "Pink mats are for tumbling. Press in the zone at the start of one for a Cartwheel, two Back Handsprings and a Back Flip, all in a row, then a Tricking Combo and a huge burst.",
    "Every race is a new course, with its own length, challenges and scenery.",
    "The fastest time across the line wins.",
  ],
  controls: [
    "Space, W or Up to jump, vault and climb",
    "S or Down to slide",
    "On touch screens, tap the top or bottom half",
    "Enter to chat",
  ],
  Component: lazy(() => import("./ui/GhostLine")),
  net,
};
export default game;
