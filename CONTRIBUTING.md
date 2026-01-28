# Contributing to stackboi

## Prerequisites

- [Bun](https://bun.sh/) (latest)
- Git 2.38+ (for `--update-refs`)
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated

## Setup

```bash
git clone https://github.com/0xrohan10/stackboi.git
cd stackboi
bun install
```

## Development

Build for your current platform:

```bash
bun run build:current
```

Run tests:

```bash
bun test
```

Lint and format:

```bash
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix issues
bun run format      # Format code
bun run check       # Run lint + format check
```

## Code Standards

- **TypeScript** — Strict mode, no `any` types
- **Effect.js** — Use Effect patterns for async operations and error handling
- **Testing** — Use `bun:test` for all tests
- **Linting** — oxlint for linting, oxfmt for formatting

## Project Structure

```
├── index.ts        # Main entry point
├── commands/       # CLI commands
├── scripts/        # Build and release scripts
├── bin/            # Binary wrappers
├── npm/            # Platform-specific npm packages
└── dist/           # Build output
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Ensure all checks pass: `bun run check && bun test`
5. Open a pull request against `main`

All PRs must pass linting, formatting, and tests before merge.
