/**
 * Single source of truth for the product name and everything derived from it.
 * Nothing else in the repo may spell the name, domain, command, or config dir as a literal.
 */
export const BRAND = {
  name: "tokenbroke",
  domain: "tokenbroke.lol",
  siteUrl: "https://tokenbroke.lol",
  npmPackage: "tokenbroke",
  cliCommand: "npx tokenbroke",
  configDirName: ".tokenbroke",
  repoUrl: "https://github.com/SnehanChakravarthi/tokenbroke",
} as const;

export function claimUrl(code: string): string {
  return `${BRAND.siteUrl}/claim/${code}`;
}
