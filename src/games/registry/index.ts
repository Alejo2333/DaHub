import type { GameModule } from "../../types/game";
import luckyDebt from "../lucky-debt";
/** Register future games here. The home page, search and game pages are built from this list. */
export const games: GameModule[] = [luckyDebt];
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
