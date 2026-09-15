/** Everything that names the pad lives here. */
export const site = {
  name: "ARCADE PAD",
  shortName: "Arcade Pad",
  hook: "Launch a token. Launch a game.",
  description:
    "A launchpad on Robinhood Chain where every token comes with its own arcade cabinet. Trading fees fill the cabinet's prize pot; the high score takes the pot.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://arcadepad.fun").replace(/\/$/, ""),
  x: process.env.NEXT_PUBLIC_X_URL ?? "",
  ponsUrl: "https://www.ponsfamily.com",
} as const;
