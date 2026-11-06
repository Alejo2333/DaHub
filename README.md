# DaHub

**DaHub** is a browser-based multiplayer game hub where players can create rooms, invite friends, and play games together. It features a shared multiplayer lobby, real-time communication, and a modular game architecture designed to make adding new games straightforward.

🌐 **Live Demo:** [https://dahub-azure.vercel.app/](https://dahub-fermil.vercel.app/)

📦 **Repository:** [https://github.com/Alejo2333/DaHub](https://github.com/Alejo2333/DaHub)

---

## Features

- **Multiplayer Rooms** – Create or join private rooms using unique room codes and invitation links.
- **Game Lobby** – View players, check readiness, and start multiplayer sessions.
- **Game Selection** – Choose from available games within the same platform.
- **Real-Time Networking** – Peer-to-peer communication powered by WebRTC.
- **In-Game Chat** – Communicate with other players during multiplayer sessions.
- **Player Management** – Track room members, player readiness, and session status.
- **Modular Architecture** – Games are developed independently and registered through a centralized game registry.
- **Host-Based Game Logic** – The room host manages game state and validates player actions.
- **Responsive Interface** – Play directly through a modern web browser.
- **No Backend Required** – Multiplayer signaling and peer communication are handled through Trystero and WebRTC.

## Technology Stack

| Technology | Purpose |
|---|---|
| React 18 | User interface |
| TypeScript | Type safety |
| Vite 6 | Development server and build tooling |
| Phaser 3 | 2D game engine |
| Tailwind CSS 4 | Styling |
| Zustand 5 | State management |
| Trystero | Peer-to-peer multiplayer networking |
| WebRTC | Real-time player communication |
| Vitest | Unit testing |
| Vercel | Hosting and deployment |

## Project Architecture

DaHub uses a modular architecture that separates the multiplayer party system from individual games.

The multiplayer layer handles shared functionality, while each game implements its own rules, state management, networking logic, and interface.

### Multiplayer Layer

The shared multiplayer system provides:

- Room creation and joining
- Player roster management
- Ready checks
- Game selection
- Session management
- Host-controlled game state
- Real-time chat
- Player actions and message validation
- Late-join state synchronization

### Game Modules

Each game is implemented as an independent module using the shared `GameModule` and `GameNet` interfaces.

This allows new games to use the existing multiplayer infrastructure without having to implement their own room system.

### Networking

DaHub uses Trystero with WebRTC for peer-to-peer communication.

- Nostr relays are used for signaling.
- Players establish direct peer connections when possible.
- The host manages authoritative game state.
- State snapshots synchronize joining players.
- Versioned messages prevent outdated state updates.
- Message validators help protect multiplayer sessions from invalid input.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- Git

### Clone the Repository

```bash
git clone https://github.com/Alejo2333/DaHub.git

cd DaHub
```

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

Open the application in your browser:

```text
http://localhost:5173
```

For multiplayer testing, open the application in multiple browser tabs or separate devices.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite development server |
| `npm run build` | Runs TypeScript checks and builds the production application |
| `npm run preview` | Previews the production build locally |
| `npm test` | Runs the test suite using Vitest |

## Environment Variables

DaHub works without additional environment variables. Optional configuration is available for signaling isolation and TURN relay support.

Create a `.env` file in the project root:

```env
# Optional signaling namespace
VITE_APP_ID=lucky-debt-hub-v1

# Optional TURN server configuration
VITE_TURN_URL=
VITE_TURN_USER=
VITE_TURN_PASS=
```

| Variable | Description |
|---|---|
| `VITE_APP_ID` | Custom Trystero signaling namespace |
| `VITE_TURN_URL` | Comma-separated TURN server URLs |
| `VITE_TURN_USER` | TURN authentication username |
| `VITE_TURN_PASS` | TURN authentication password |

**Note:** Environment variables prefixed with `VITE_` are exposed in the client-side application bundle. Never use permanent or privileged credentials. Use restricted, short-lived TURN credentials where possible.

Redeploy the application after changing production environment variables.

## Project Structure

```text
DaHub/
├── public/
├── src/
│   ├── app/
│   │   ├── ChatBox.tsx
│   │   └── ...
│   ├── games/
│   │   ├── _template/
│   │   ├── gamble-with-janny/
│   │   ├── ghost-line/
│   │   └── registry/
│   ├── multiplayer/
│   │   ├── room.ts
│   │   ├── party.ts
│   │   ├── validate.ts
│   │   ├── guards.ts
│   │   └── fakeNetwork.ts
│   ├── stores/
│   │   └── app.ts
│   └── types/
│       └── game.ts
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

*The structure above highlights the main application modules and configuration files.*

## Adding a New Game

DaHub provides a reusable game template and shared multiplayer infrastructure.

To add a new game:

1. Copy `src/games/_template` into a new folder under `src/games/`.
2. Update the game's metadata and assign it a unique, permanent ID.
3. Configure the minimum and maximum player limits.
4. Implement the game state and host logic.
5. Define player actions and their validation rules.
6. Implement the game interface.
7. Register the game in `src/games/registry/index.ts`.

Once registered, the game becomes available through the GameHub interface and can use the existing room, lobby, and multiplayer systems.

### Game Development Interfaces

- `GameModule` – Defines the game's metadata and module configuration.
- `GameNet` – Provides networking functionality for game modules.
- `createHost` – Initializes host-side game logic.
- `sendAction` – Sends player actions to the host.
- `ctx.publish()` – Broadcasts updated game state.
- `isState` – Validates incoming game state.
- `isAction` – Validates incoming player actions.

## Testing

DaHub uses Vitest for automated testing.

Run the test suite:

```bash
npm test
```

The project includes tests for multiplayer state transitions, party management, and game networking logic.

A fake networking implementation is also available for testing multiplayer behavior without establishing real peer connections.

## Deployment

DaHub is configured for deployment on **Vercel** using Vite.

1. Push your project to GitHub.
2. Import the repository into your Vercel account.
3. Select **Vite** as the framework preset.
4. Configure any optional environment variables.
5. Deploy the application.

The included `vercel.json` rewrites application routes to `index.html`, allowing client-side routes such as party invitation links to work correctly after refreshing the page.

## Networking Considerations

DaHub uses direct peer-to-peer connections whenever possible. However, some network configurations may prevent players from establishing direct connections.

Common examples include:

- Symmetric NAT configurations
- Corporate firewalls
- Restricted mobile networks
- Certain home router configurations

A TURN relay can be configured to help establish connections in these environments.

If players experience connection issues, consider configuring a TURN server such as coturn or using a hosted TURN provider.

## Security Considerations

- The host manages game state and game results within their browser.
- Client-side game logic is not tamper-proof.
- Multiplayer messages are validated before processing.
- Room invitation links should only be shared with trusted players.
- TURN credentials exposed through Vite environment variables should be restricted and rotated.
- The platform uses fictional in-game currency with no real-world cash value.

DaHub is intended for casual multiplayer entertainment and should not be used for real-money gambling or financial transactions.

## Contributing

Contributions, suggestions, and improvements are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Implement your changes.
4. Run the tests and production build.
5. Submit a pull request.

## License

No license has been specified for this repository yet. All rights are reserved by the repository owner unless a license is added.

---

<p align="center">
  **DaHub**
  <br />
  A place to play, compete, and connect with friends.
  <br />
  <a href="https://dahub-fermil.vercel.app/">Live Demo</a> · <a href="https://github.com/Alejo2333/DaHub">GitHub Repository</a>
</p>
