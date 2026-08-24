// Poverty + small creature + number. Deadpan, never a slur, never targets a group.
export const NAME_ADJECTIVES = [
  "starving",
  "tokenless",
  "broke",
  "destitute",
  "throttled",
  "penniless",
  "famished",
  "depleted",
  "bankrupt",
  "overdrawn",
  "parched",
  "threadbare",
  "skint",
  "busted",
  "hollow",
  "gaunt",
  "wilted",
  "drained",
  "rationed",
  "capped",
  "ratelimited",
  "quotaless",
  "creditless",
  "exhausted",
  "stranded",
  "idle",
  "waiting",
  "rejected",
  "declined",
  "forsaken",
] as const;

export const NAME_NOUNS = [
  "crab",
  "wretch",
  "goblin",
  "intern",
  "raccoon",
  "gremlin",
  "pigeon",
  "urchin",
  "peasant",
  "serf",
  "hermit",
  "vagrant",
  "lemming",
  "sloth",
  "mole",
  "moth",
  "pauper",
  "shrimp",
  "weasel",
  "vole",
  "toad",
  "newt",
  "badger",
  "squatter",
  "nomad",
  "husk",
  "contractor",
  "freelancer",
  "cofounder",
  "prompter",
] as const;

const MAX_SUFFIX = 99;

/** `random` must return a float in [0, 1). */
export function generateAnonymousName(random: () => number = Math.random): string {
  const adjective = NAME_ADJECTIVES[Math.floor(random() * NAME_ADJECTIVES.length)];
  const noun = NAME_NOUNS[Math.floor(random() * NAME_NOUNS.length)];
  const suffix = 1 + Math.floor(random() * MAX_SUFFIX);
  return `${adjective}-${noun}-${suffix}`;
}

export const ANONYMOUS_NAME_PATTERN = /^[a-z]+-[a-z]+-(?:[1-9]|[1-9][0-9])$/;
