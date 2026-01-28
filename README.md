# stackboi

A terminal UI for managing stacked pull requests on GitHub.

Stacked PRs let you split large features into small, reviewable chunks that build on each other. But after GitHub squash-merges a PR, downstream branches break. stackboi fixes this by automatically rebasing your stack and updating all branch pointers.

## Features

- **Interactive tree view** — See your entire stack at a glance with PR status, sync state, and branch relationships
- **Auto-sync on merge** — Polls GitHub and prompts you to rebase when a PR gets merged
- **Smart rebasing** — Uses `git rebase --update-refs` to update all branches in one operation
- **Conflict memory** — Leverages git rerere to remember and auto-apply conflict resolutions
- **PR creation** — Creates PRs with correct base branches and stack visualization in the description

## Requirements

- Git 2.38+ (for `--update-refs`)
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated
- [Bun](https://bun.sh/)

## Installation

```bash
git clone https://github.com/your-username/stackboi.git
cd stackboi
bun install
```

## Quick Start

```bash
# Initialize in your repo
bun run index.ts init

# Start a new stack from main
git checkout main
bun run index.ts new feature/auth-base

# Add branches to the stack
bun run index.ts add feature/auth-login
bun run index.ts add feature/auth-logout

# Create PRs for each branch
bun run index.ts pr feature/auth-base
bun run index.ts pr feature/auth-login
bun run index.ts pr feature/auth-logout

# Open the interactive view
bun run index.ts view
```

## Commands

| Command        | Description                               |
| -------------- | ----------------------------------------- |
| `init`         | Initialize stackboi in the current repo   |
| `new <branch>` | Create a new stack with an initial branch |
| `add <branch>` | Add a branch to the current stack         |
| `view`         | Open interactive tree view                |
| `pr <branch>`  | Create a GitHub PR for a branch           |

## How It Works

### The Problem

You have a stack of branches:

```
main
 └── feature/auth-base (PR #1)
      └── feature/auth-login (PR #2)
           └── feature/auth-logout (PR #3)
```

PR #1 gets squash-merged. Now `feature/auth-login` has a broken history — it's based on commits that no longer exist on main.

### The Solution

When stackboi detects a merged PR:

1. Rebases the next branch onto the updated base
2. Uses `--update-refs` to automatically move all downstream branch pointers
3. Uses git rerere to auto-resolve conflicts you've solved before
4. Updates PR base branches and descriptions on GitHub

Your stack stays clean without manual intervention.

## Interactive View

The `view` command shows a tree of your stacks:

```
Stacks
├── auth-stack
│   ├── feature/auth-base      PR #12 ✓ merged
│   ├── feature/auth-login     PR #13 ● open     needs-rebase
│   └── feature/auth-logout    PR #14 ○ draft    up-to-date
└── refactor-stack
    ├── refactor/extract-utils PR #15 ● open     up-to-date
    └── refactor/cleanup       PR #16 ● open     up-to-date
```

Navigate with arrow keys. Press enter to sync when prompted.

## Configuration

stackboi stores metadata in `.stackboi.json`:

```json
{
  "version": 1,
  "stacks": [
    {
      "name": "auth-stack",
      "baseBranch": "main",
      "branches": ["feature/auth-base", "feature/auth-login", "feature/auth-logout"]
    }
  ],
  "settings": {
    "rerere": { "enabled": true, "autoupdate": true },
    "defaultBaseBranch": "main",
    "pollIntervalMs": 30000
  }
}
```

This file is local to your machine and should be gitignored.

## License

MIT
