# Game Hub: Gamble with Janny
React + TypeScript + Vite, Phaser 3, Trystero (WebRTC), Tailwind v4, Zustand. No backend, no database.

    npm install && npm run dev        # http://localhost:5173 (open two tabs)
    npm test                          # payouts, wallet, debt progression, state transitions
    npm run build                     # type-check + production build
Deploy: import the repo in Vercel (Framework: Vite). `vercel.json` rewrites every path to `index.html`, so `/party/ABCDE` survives refresh.

## Environment variables (all optional)
`VITE_APP_ID` signalling namespace. `VITE_TURN_URL` (comma-separated URLs), `VITE_TURN_USER`, `VITE_TURN_PASS` add a TURN relay. `VITE_*` values are built into the bundle, so redeploy after changing them.

## Networking and TURN
Trystero uses public Nostr relays for signalling and then direct WebRTC. `RELAY_URLS` in `multiplayer/room.ts` pins relays tested to deliver Trystero's events, because many public relays are down or reject them. Re-test and update the list if joining starts failing with a "matchmaking servers" error, and remember that peers must share a relay.

Symmetric NATs, corporate firewalls, some mobile carriers and some home routers (even between devices on the same Wi-Fi) block direct connections; the join screen reports "No host answered" after 30s. Fix by supplying a TURN server (coturn, or a hosted one) through the variables above. Include the provider's TCP/TLS URLs, since those get through strict firewalls. TURN credentials are visible in the public bundle, so use a low-quota account.

## Architecture
- `multiplayer/` and `stores/app.ts` are the party layer and work with any game. Nothing in them imports from `games/`.
- `multiplayer/room.ts` typed Trystero wrapper. `multiplayer/party.ts` roster, ready, start, return-to-lobby, session ids, versions, chat.
- Parties carry a game id. The host picks the game, and joining players learn it from the first `STATE_SNAPSHOT`.
- Each game is one folder in `games/`, plugged in through `GameModule` and `GameNet` in `types/game.ts`. The party layer treats a game's state and messages as opaque, and passes them through the game's validators.
- Versioned messages: every host broadcast has a session id (`sid`) and increasing `v`; peers drop stale or foreign-session messages. Peer messages such as movement are unversioned.
- `games/registry` lists games on the home page, in search and on their own pages. `comingSoon` holds placeholder tiles; delete an entry when a real game replaces it.
- Host leaving ends the session for everyone (safe termination; no migration). Late joiners get a `STATE_SNAPSHOT`.
- Chat (`app/ChatBox.tsx`) goes through the host, which names the sender, cleans the text and limits each player to one message per 400 ms. It isn't saved, so late joiners only see new messages. The casino scene also shows each message as a bubble over the sender's head.
- `multiplayer/validate.ts` checks the shape of every party message, and each game's validators check its own. Only the host named in the first snapshot can send state after that, and only party members can act.
- `games/gamble-with-janny/net/` holds the casino's host rules, client hooks and validators. `scenes/art.ts` draws all casino art in code on canvases, so there are no image files. `ui/stages.tsx` holds each game's animated stage.

## Adding a game
The party layer already gives every game rooms, invite links, the lobby, ready checks, chat, late joining and message validation plumbing. A new game only needs its rules and its screen.

1. Copy `src/games/_template` to `src/games/your-game`. It's a complete game (first to 10 taps wins) in about 100 lines.
2. In its `index.ts`, change the listing details. `id` must be unique and must stay the same once published, because parties find the game by it. `minPlayers` and `maxPlayers` set the lobby's limits.
3. Add it to `games` in `src/games/registry/index.ts`. It now has a page, and parties can play it.
4. Write the rules, then the screen:
   - **State:** everything all players can see. Change it in `createHost`, then call `ctx.publish()`.
   - **Actions:** what a player can ask for. The screen calls `sendAction(action)`, and the host's `onAction` decides whether it's allowed.
   - **Validators:** `isState` and `isAction` check whatever other players send. Treat every field as hostile. `multiplayer/guards.ts` has the building blocks.
   - **Screen:** read the state with `useApp(s => s.gameState as YourState | null)`. `ChatBox` and `Avatar` in `app/` can be reused.

The rules only run in the host's browser, so put timers in `createHost` and stop them in `dispose`. Players receive the whole state, so hide secrets by keeping them out of it, as the casino does with its crash points.

Most games only need that. For more, see the optional parts of `GameNet`, which the casino uses:
- **One-off events** (`isEvent`, `ctx.emit`, `ctx.sendTo`, `client.onEvent`) for things that aren't state, such as a win animation or a refused bet.
- **Peer messages** (`isPeer`, `sendToPeers`, `client.onPeer`) for frequent cosmetic updates such as movement, which skip the host.
- **Client hooks** (`client.onStart`, `onStop`, `onPlayerLeave`) to reset anything the game keeps locally, usually in its own Zustand store.

`multiplayer/fakeNetwork.ts` lets tests play a game without a network. `multiplayer/party.test.ts` and `games/gamble-with-janny/net/net.test.ts` show how.

## Security
The host is a browser tab. It generates every result with `crypto.getRandomValues` and can edit its own memory, so **this is not tamper-proof and must never be used for real money.** Chips are fictional, have no cash value, and cannot be bought or redeemed.

`VITE_*` values are compiled into the public JavaScript, so anyone can read `VITE_TURN_PASS`. Use credentials you can rotate, with usage limits on the relay. A joining client trusts whichever peer sends the first snapshot, so a room code should only go to people you trust.

## Mechanics
- **Shared wallet:** everyone bets from the same chips. The debt is checked when the clock hits zero.
- **Pay early:** once the wallet covers the debt, any player can pay it. Each unused second becomes 2 bonus chips.
- **Debt curve:** teams start with 1,200 chips and floor 1 costs 1,300 (`START_CHIPS` and `FIRST_FLOOR_DEBT` in `odds.ts`). Floor 2 costs 2,100, and each later floor costs 40% more.
- **Payday:** clearing a floor gives the team a share of the next floor's base debt (`FLOOR_PAYDAY` in `odds.ts`). The main difficulty setting.
- **Janny's marker:** once per floor, any player can take +300 chips in exchange for +500 on that floor's debt. Each marker also adds 100 to every later floor's debt. A team below the 10-chip minimum with no marker left this floor loses immediately.
- **Final choice:** after floor 5 the host chooses to walk out free (win) or play a sixth floor at double the normal debt to buy the casino (win bigger, or lose the run).
- **Crash:** the wager leaves the wallet at launch and the host draws a hidden crash point. The player cashes out on the host's clock, so a late click loses. Flights cash out automatically when the round ends or the player disconnects.

## Balance
Change odds and payouts in `games/gamble-with-janny/mechanics/odds.ts`. The odds players see are generated from it, and `npm test` fails if a change gives players the edge. Floor rules are in `floors.ts` and shop items in `shop.ts`.

Default RTP: slots ≈82%, roulette 97.3%, dice 83–92%, wheel 87.5%, crash 95%. Hot Machines (+4%, max 2) only boosts slots/dice/wheel, which stays below 100% RTP at max stacks (tested).
