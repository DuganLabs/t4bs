import { json } from "../_shared/util.js";
import { gameEngine } from "../_shared/game.js";

export const onRequestGet = async ({ env }) => json(await gameEngine(env).listPuzzles());
