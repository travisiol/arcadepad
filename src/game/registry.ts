import { breakout } from "./games/breakout";
import { invaders } from "./games/invaders";
import { racer } from "./games/racer";
import { snake } from "./games/snake";
import type { BaseState, GameDef, GameId } from "./types";

/**
 * The cabinet row. The ORDER is the contract's game id (uint8): a launch
 * stores the index, so nothing may be inserted or reordered — only appended.
 */
export const GAMES: ReadonlyArray<GameDef<BaseState>> = [
  snake as unknown as GameDef<BaseState>,
  breakout as unknown as GameDef<BaseState>,
  racer as unknown as GameDef<BaseState>,
  invaders as unknown as GameDef<BaseState>,
];

export const GAME_COUNT = GAMES.length;

export function gameByIndex(i: number): GameDef<BaseState> | null {
  return Number.isInteger(i) && i >= 0 && i < GAMES.length ? GAMES[i] : null;
}

export function gameById(id: string): GameDef<BaseState> | null {
  return GAMES.find((g) => g.id === id) ?? null;
}

export function gameIndex(id: GameId): number {
  return GAMES.findIndex((g) => g.id === id);
}
