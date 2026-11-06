import type { GameNet } from "../../../types/game";
import type { Action, Event, GState, Peer } from "../types";
import { client } from "./client";
import { createHost } from "./host";
import { isAction, isEvent, isPeer, isState } from "./validate";

export const net: GameNet<GState, Action, Event, Peer> = {
  isState,
  isAction,
  isEvent,
  isPeer,
  createHost,
  client,
};
