# Contributing

Thanks for helping out. Bug reports, feed fixes and small improvements are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Report security issues privately as described in [SECURITY.md](SECURITY.md).
- Do not add pages from sites whose terms forbid reuse. Test fixtures must be public pages that allow it, with the source listed in [test/fixtures/SOURCES.md](test/fixtures/SOURCES.md).

## Workflow

1. Fork the repository and create a branch from `main`, such as `fix/date-parsing`.
2. Set up with Node.js 24+ and pnpm:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Make your change and add a test for it.
4. Run the checks:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

5. Open a pull request against `main`. CI must pass before it is merged.

## Commit messages

One line in English: `<type>: <subject>`.

- type: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`
- subject: lowercase, imperative, no trailing period

```
fix: keep timezone when parsing dates without an offset
```

Pull requests are squash-merged, so the pull request title becomes the commit message.

## Code style

Biome formats and lints the code; run `pnpm format` to fix most issues. Keep runtime dependencies at zero, and avoid comments that restate the code.

By contributing, you agree that your work is licensed under the [MIT License](LICENSE).
