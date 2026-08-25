# Contributing

Issues are very welcome — bug reports, local file formats the readers should handle better, and
anything that looks off on the board.

For code: open an issue first so we can agree on direction before you build. The non-negotiables in
[AGENTS.md](AGENTS.md) (data integrity, privacy, the single trust lane) are not up for PR — features
that add manual data entry or weaken the "everything on the board is real" property will be declined
kindly.

By submitting a contribution you agree it is licensed under the repository's [MIT license](LICENSE)
(inbound = outbound).

Dev setup: `bun install`, then see the commands in the [README](README.md). Run
`bun run lint && bun run typecheck && bun run test` before opening a PR.
