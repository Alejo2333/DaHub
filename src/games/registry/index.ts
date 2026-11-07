import type { GameModule } from "../../types/game";
import gambleWithJanny from "../gamble-with-janny";
import testGame from "../_template";
import ghostLine from "../ghost-line";
import crossyrace from "../crossy-race";
import floorIsLava from "../floor-is-lava";

/** Add each game here. The home page, search, game pages and parties all use this list. See "Adding a game" in the README. */
export const games: GameModule[] = [
  gambleWithJanny,
  testGame,
  ghostLine,
  crossyrace,
  floorIsLava,
];
export const getGame = (id: string) => games.find((g) => g.id === id);
/** Placeholder tiles so the library doesn't look empty. Delete an entry when a real game takes its place. */
export const comingSoon: { category: string; icon: string }[] = [
  //  {category:'Racing',icon:'🏎️'},{category:'Puzzle',icon:'🧩'},{category:'Shooter',icon:'🎯'},
  //  {category:'Arcade',icon:'👾'},{category:'Strategy',icon:'♟️'},{category:'Sports',icon:'⚽'},{category:'Party',icon:'🎉'}
];
export const categories = [
  ...new Set([
    ...games.map((g) => g.category),
    ...comingSoon.map((c) => c.category),
  ]),
];
