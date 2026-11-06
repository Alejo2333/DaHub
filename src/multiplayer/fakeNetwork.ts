/**
 * A fake network for tests. In a test file:
 *   vi.mock("trystero/nostr", async () => (await import("<path>/fakeNetwork")).trystero);
 * Then `net.recv` delivers a message as if it came from a peer, and `net.sent` records what we sent.
 */
interface FakeRoom {
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
}
export const net = {
  recv: null as null | ((d: unknown, from: string) => void),
  sent: [] as [any, string?][], // eslint-disable-line @typescript-eslint/no-explicit-any
  relayOpen: true,
  config: null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  room: null as FakeRoom | null,
  reset() {
    this.sent = [];
    this.relayOpen = true;
  },
};
export const trystero = {
  selfId: "SELF",
  getRelaySockets: () => ({
    relay: { readyState: net.relayOpen ? 1 : 3 },
  }),
  joinRoom: (config: unknown) => {
    net.config = config;
    const room = {
      makeAction: () => ({
        send: async (d: unknown, o?: { target?: string }) => {
          net.sent.push([d, o?.target]);
        },
        set onMessage(cb: (d: unknown, c: { peerId: string }) => void) {
          net.recv = (d, from) => cb(d, { peerId: from });
        },
      }),
      onPeerJoin: null,
      onPeerLeave: null,
      leave: async () => {},
    };
    net.room = room;
    return room;
  },
};
