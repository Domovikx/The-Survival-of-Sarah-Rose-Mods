// Vortex game extension for The Survival of Sarah Rose (Ren'Py).
//
// Mods deploy to the GAME ROOT: queryModPath() returns '' and mergeMods is on,
// so the AI Voice Pack FOMOD paths (`mods/tssr-ai-voice-pack/...`,
// `environment.txt`) land exactly where Ren'Py expects them.
//
// The game location is autodetected (no hardcoded paths):
//   1. Steam library, App ID 2166470;
//   2. fallback by display name;
//   3. if neither works, Vortex asks the user to browse for the game folder.

const { util } = require("vortex-api");

const GAME_ID = "thesurvivalofsarahrose";
const GAME_NAME = "The Survival of Sarah Rose";
const STEAM_APP_ID = "2166470";

function findGame() {
  // Steam manifests carry the appid as a string, but Vortex parsers differ
  // between builds, so try both types before falling back to the name.
  // The store entry keeps the install path in `gamePath` (verified 2026-11-13:
  // { appid, gameStoreId, name, gamePath, lastUser, lastUpdated, manifestData }).
  return util.steam
    .findByAppId(STEAM_APP_ID)
    .catch(() => util.steam.findByAppId(Number(STEAM_APP_ID)))
    .catch(() => util.steam.findByName(GAME_NAME))
    .then((game) => {
      const gamePath = game === undefined || game === null ? undefined : game.gamePath;
      if (typeof gamePath !== "string" || gamePath === "") {
        throw new Error(`${GAME_NAME} was not found in the Steam library.`);
      }
      return gamePath;
    });
}

function main(context) {
  context.registerGame({
    id: GAME_ID,
    name: GAME_NAME,
    mergeMods: true,
    queryPath: findGame,
    supportedTools: [],
    queryModPath: () => "",
    logo: "gameart.jpg",
    executable: () => "TheSurvivalofSarahRose.exe",
    requiredFiles: ["TheSurvivalofSarahRose.exe"],
    setup: () => Promise.resolve(),
    environment: { SteamAPPId: STEAM_APP_ID },
    details: { steamAppId: STEAM_APP_ID },
  });

  return true;
}

module.exports = { default: main };
