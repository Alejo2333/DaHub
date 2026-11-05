# Game Hub: Gamble with Fermil
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
- `multiplayer/room.ts` typed Trystero wrapper. `multiplayer/party.ts` roster, ready, start, return-to-lobby, session ids, versions, host-authoritative game messages.
- Versioned messages: every host broadcast has a session id (`sid`) and increasing `v`; peers drop stale or foreign-session messages. Movement is unversioned, ~10 Hz, interpolated.
- `games/registry` + `types/game.ts` (`GameModule`) list a game on the home page, in search and on its own page. `comingSoon` holds placeholder tiles; delete an entry when a real game replaces it.
- Parties can only run `games[0]` for now: `multiplayer/party.ts` imports the Gamble with Fermil ledger and party messages carry no game id. A second multiplayer game needs both changed.
- Host leaving ends the session for everyone (safe termination; no migration). Late joiners get a `STATE_SNAPSHOT`.

- Chat (`app/ChatBox.tsx`) goes through the host, which names the sender, cleans the text and limits each player to one message per 400 ms. It isn't saved, so late joiners only see new messages. The casino scene also shows each message as a bubble over the sender's head.
- `multiplayer/validate.ts` checks the shape of every inbound message. Only the host named in the first snapshot can send state after that, and only party members can act.
- `games/gamble-with-fermil/scenes/art.ts` draws all casino art in code on canvases, so there are no image files. `ui/stages.tsx` holds each game's animated stage.

## Security
The host is a browser tab. It generates every result with `crypto.getRandomValues` and can edit its own memory, so **this is not tamper-proof and must never be used for real money.** Chips are fictional, have no cash value, and cannot be bought or redeemed.

`VITE_*` values are compiled into the public JavaScript, so anyone can read `VITE_TURN_PASS`. Use credentials you can rotate, with usage limits on the relay. A joining client trusts whichever peer sends the first snapshot, so a room code should only go to people you trust.

## Mechanics
- **Shared wallet:** everyone bets from the same chips. The debt is checked when the clock hits zero.
- **Pay early:** once the wallet covers the debt, any player can pay it. Each unused second becomes 2 bonus chips.
- **Debt curve:** teams start with 1,200 chips and floor 1 costs 1,300 (`START_CHIPS` and `FIRST_FLOOR_DEBT` in `odds.ts`). Floor 2 costs 2,100, and each later floor costs 40% more.
- **Payday:** clearing a floor gives the team a share of the next floor's base debt (`FLOOR_PAYDAY` in `odds.ts`). The main difficulty setting.
- **Fermil's marker:** once per floor, any player can take +300 chips in exchange for +500 on that floor's debt. Each marker also adds 100 to every later floor's debt. A team below the 10-chip minimum with no marker left this floor loses immediately.
- **Final choice:** after floor 5 the host chooses to walk out free (win) or play a sixth floor at double the normal debt to buy the casino (win bigger, or lose the run).
- **Crash:** the wager leaves the wallet at launch and the host draws a hidden crash point. The player cashes out on the host's clock, so a late click loses. Flights cash out automatically when the round ends or the player disconnects.

## Balance
Change odds and payouts in `games/gamble-with-fermil/mechanics/odds.ts`. The odds players see are generated from it, and `npm test` fails if a change gives players the edge. Floor rules are in `floors.ts` and shop items in `shop.ts`.

Default RTP: slots ≈82%, roulette 97.3%, dice 83–92%, wheel 87.5%, crash 95%. Hot Machines (+4%, max 2) only boosts slots/dice/wheel, which stays below 100% RTP at max stacks (tested).
