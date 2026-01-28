# PRD: Stackboi - Stacked Diffs TUI for GitHub

## Overview

Stackboi is a TUI tool that simplifies working with stacked PRs (stacked diffs) on GitHub. The core challenge it solves is maintaining stack integrity after squash merges, which break commit hashes and parent-child relationships.

The tool leverages Git 2.38+'s `--update-refs` feature for automatic branch pointer updates during rebase, combined with `git rerere` for learning conflict resolution patterns. It stores stack metadata locally and manages GitHub PR base branches, descriptions, and labels automatically.

## Goals

- Eliminate manual branch management overhead when working with stacked PRs
- Automatically maintain stack integrity after any merge strategy (squash, merge, rebase)
- Learn and apply conflict resolution patterns via git rerere integration
- Provide clear visibility into stack state and sync status
- Reduce context-switching between terminal and GitHub

## Quality Gates

These commands must pass for every user story:
- `bun test` - Unit and integration tests
- `bun run typecheck` - TypeScript type checking
- `bun run lint` - Linting

## User Stories

### US-001: Initialize stack metadata storage
As a user, I want to initialize stackboi in my repo so that it can track my stacked branches.

**Acceptance Criteria:**
- [ ] `stackboi init` command creates `.stackboi.json` in repo root
- [ ] Schema includes: stacks array, global settings, rerere preferences
- [ ] Validates Git version is 2.38+ (required for --update-refs)
- [ ] Adds `.stackboi.json` to `.gitignore` suggestion (user choice)
- [ ] Detects existing `gh` CLI auth, fails gracefully if not authenticated

### US-002: Create new stack with initial branch
As a user, I want to create a new stack from my current branch so that I can start building dependent changes.

**Acceptance Criteria:**
- [ ] TUI command creates a new stack entry in metadata
- [ ] Records base branch (e.g., `main`) as stack root
- [ ] Creates first feature branch with user-provided name
- [ ] Switches to the new branch automatically
- [ ] Updates metadata with branch -> stack relationship

### US-003: Add branch to existing stack
As a user, I want to add a new branch on top of my current stacked branch so that I can continue building dependent changes.

**Acceptance Criteria:**
- [ ] TUI command creates new branch from current HEAD
- [ ] Adds branch to current stack's branch list in correct order
- [ ] Records parent branch relationship in metadata
- [ ] Switches to the new branch automatically

### US-004: Display stack tree view
As a user, I want to see all my stacks in a tree visualization so that I can understand the current state.

**Acceptance Criteria:**
- [ ] Ink-based TUI renders tree with branch hierarchy
- [ ] Each branch shows: name, PR number (if exists), PR status, sync status
- [ ] Sync status indicates: up-to-date, needs push, needs rebase, conflicts
- [ ] Tree uses box-drawing characters for clear hierarchy
- [ ] Keyboard navigation: arrow keys to move, enter to select

### US-005: Poll GitHub for PR status updates
As a user, I want the TUI to check GitHub for merged PRs so that I know when to sync my stack.

**Acceptance Criteria:**
- [ ] Uses `gh` CLI to fetch PR status for all tracked branches
- [ ] Polls on configurable interval (default: 30 seconds) when TUI is open
- [ ] Updates tree view status indicators in real-time
- [ ] Detects when a PR has been merged (any strategy)

### US-006: Prompt sync on merge detection
As a user, I want to be prompted when a PR is merged so that I can sync child branches.

**Acceptance Criteria:**
- [ ] Shows notification overlay when merge detected
- [ ] Notification shows which PR was merged and affected child branches
- [ ] Offers "Sync now?" prompt with Y/N
- [ ] "N" dismisses and updates status indicator to show pending sync
- [ ] "Y" triggers sync operation (US-007)

### US-007: Sync stack after merge (rebase with --update-refs)
As a user, I want to sync my stack after a PR is merged so that child branches are rebased correctly.

**Acceptance Criteria:**
- [ ] Fetches latest from remote (origin)
- [ ] Identifies merged branch and all descendants in stack
- [ ] Runs `git rebase --update-refs` to rebase descendants onto new base
- [ ] --update-refs automatically updates all tracked branch pointers
- [ ] Shows progress in TUI during rebase operation
- [ ] On success, removes merged branch from stack metadata

### US-008: Configure and enable git rerere
As a user, I want stackboi to configure git rerere so that conflict resolutions are remembered.

**Acceptance Criteria:**
- [ ] On init, enables `rerere.enabled = true` in local git config
- [ ] Enables `rerere.autoUpdate = true` for automatic staging
- [ ] Stores rerere training data in standard `.git/rr-cache`
- [ ] Shows status of rerere (trained resolutions count) in TUI

### US-009: Handle conflicts with rerere resolution
As a user, I want automatic conflict resolution using learned patterns so that repeated conflicts resolve automatically.

**Acceptance Criteria:**
- [ ] During rebase, git rerere automatically applies known resolutions
- [ ] If rerere resolves all conflicts, rebase continues automatically
- [ ] If unresolved conflicts remain, pauses rebase and notifies user
- [ ] Shows which files have unresolved conflicts
- [ ] Provides option to open editor or abort

### US-010: Push all branches in stack
As a user, I want to push all branches in my stack so that GitHub PRs are updated.

**Acceptance Criteria:**
- [ ] TUI command pushes all branches in selected stack
- [ ] Uses `--force-with-lease` for safety
- [ ] Shows progress per branch
- [ ] Reports success/failure for each branch
- [ ] Handles case where branch doesn't have upstream yet (sets upstream)

### US-011: Create GitHub PR from branch
As a user, I want to create a PR for my current branch so that it's linked to the stack.

**Acceptance Criteria:**
- [ ] TUI command opens PR creation flow
- [ ] Automatically sets base branch to parent branch in stack (or stack root if first)
- [ ] Suggests PR title from branch name or first commit
- [ ] Adds stack visualization to PR description
- [ ] Adds label indicating stack position (e.g., `stack:2/4`)
- [ ] Opens created PR in browser

### US-012: Update PR metadata after sync
As a user, I want PR base branches and descriptions to update after syncing so that GitHub reflects the current state.

**Acceptance Criteria:**
- [ ] After successful sync, updates base branch of affected PRs via GitHub API
- [ ] Updates stack visualization in PR descriptions
- [ ] Updates stack position labels if order changed
- [ ] Uses `gh` CLI for all GitHub operations

### US-013: View PR in browser
As a user, I want to quickly open a PR in my browser so that I can review or share it.

**Acceptance Criteria:**
- [ ] Keyboard shortcut from tree view opens selected branch's PR
- [ ] Uses `gh pr view --web` or equivalent
- [ ] Shows error if branch doesn't have a PR yet

### US-014: Switch between stacks (tabs)
As a user, I want to switch between multiple independent stacks so that I can manage separate workstreams.

**Acceptance Criteria:**
- [ ] Tab bar or selector shows all stacks
- [ ] Stacks labeled by base branch or custom name
- [ ] Keyboard shortcut to cycle through stacks
- [ ] Selected stack determines which tree is displayed

### US-015: Delete branch from stack
As a user, I want to remove a branch from my stack (after merge or abandonment) so that the tree stays clean.

**Acceptance Criteria:**
- [ ] TUI command removes branch from stack metadata
- [ ] Optionally deletes local branch
- [ ] Optionally deletes remote branch
- [ ] Re-links child branches to deleted branch's parent
- [ ] Updates affected PRs' base branches on GitHub

### US-016: Reorder branches in stack
As a user, I want to reorder branches in my stack so that I can adjust dependencies.

**Acceptance Criteria:**
- [ ] TUI provides move up/down commands for selected branch
- [ ] Validates reorder won't create impossible state
- [ ] Triggers rebase to apply new order
- [ ] Updates metadata with new order
- [ ] Updates PR base branches accordingly

## Functional Requirements

- FR-1: The system must require Git version 2.38 or higher for --update-refs support
- FR-2: The system must use the `gh` CLI for all GitHub API operations
- FR-3: The system must store stack metadata in `.stackboi.json` at repository root
- FR-4: The system must use `--force-with-lease` for all force pushes
- FR-5: The system must enable and utilize git rerere for conflict resolution learning
- FR-6: The system must support squash merge, merge commit, and rebase merge strategies
- FR-7: The system must maintain PR descriptions with current stack visualization
- FR-8: The system must apply stack position labels to PRs (e.g., `stack:1/3`)
- FR-9: The TUI must be built with Ink (React for CLI)
- FR-10: The system must poll GitHub for status updates when TUI is running

## Non-Goals

- Custom merge strategies or merge automation (user merges via GitHub)
- Cross-repository stacks
- Team collaboration features (shared stack state)
- GitHub Actions integration for CI status (future enhancement)
- Support for GitLab, Bitbucket, or other forges
- Graphical (non-TUI) interface
- Git version < 2.38 support

## Technical Considerations

- **Git --update-refs**: Core to the approach. See https://andrewlock.net/working-with-stacked-branches-in-git-is-easier-with-update-refs/
- **Ink framework**: React patterns for TUI, good DX, handles input/rendering
- **gh CLI dependency**: Simplifies auth and GitHub operations significantly
- **Bun runtime**: Per project requirements, use Bun for all tooling
- **Polling vs webhooks**: Polling chosen for simplicity; no external infrastructure needed

## Success Metrics

- Stack sync after squash merge completes without manual intervention (when rerere trained)
- All child branch pointers update correctly via --update-refs
- PR base branches retarget automatically after parent merge
- Conflict resolutions are learned and auto-applied on subsequent occurrences

## Open Questions

- Should we support importing existing branches into a stack (vs only creating via TUI)?
- What's the desired behavior if a branch is in multiple stacks?
- Should stack visualization in PR descriptions use a specific format (mermaid, ASCII, etc.)?
- How should we handle the case where someone else pushes to a branch in the stack?