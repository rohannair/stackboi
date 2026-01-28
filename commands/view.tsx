import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { $ } from "bun";
import {
  type StackboiConfig,
  type Stack,
  type RerereStats,
  getGitRoot,
  isGitRepo,
  checkGhAuth,
  getRerereStats,
  DEFAULT_POLL_INTERVAL_MS,
} from "./init";
import { loadConfig, saveConfig, getCurrentBranch } from "./new";

// Sync operation state
export type SyncState =
  | "idle"
  | "fetching"
  | "rebasing"
  | "success"
  | "error";

export interface SyncProgress {
  state: SyncState;
  message: string;
  mergedBranch: string;
  childBranches: string[];
  currentBranch: string | null;
  error: string | null;
}

// Sync status for a branch
export type SyncStatus =
  | "up-to-date"
  | "needs-push"
  | "needs-rebase"
  | "conflicts"
  | "pending-sync"
  | "unknown";

// PR status from GitHub
export type PRStatus =
  | "open"
  | "merged"
  | "closed"
  | "draft"
  | "none";

export interface BranchInfo {
  name: string;
  prNumber: number | null;
  prStatus: PRStatus;
  syncStatus: SyncStatus;
}

export interface StackWithInfo {
  stack: Stack;
  branches: BranchInfo[];
}

// Notification for a merged PR
export interface MergedPRNotification {
  branchName: string;
  prNumber: number;
  childBranches: string[];
  stackName: string;
}

// Box-drawing characters for tree
const TREE_CHARS = {
  vertical: "│",
  branch: "├",
  lastBranch: "└",
  horizontal: "─",
} as const;

async function getBranchSyncStatus(branchName: string): Promise<SyncStatus> {
  // Check if remote tracking branch exists
  const remoteRef = await $`git rev-parse --verify origin/${branchName}`
    .quiet()
    .nothrow();

  if (remoteRef.exitCode !== 0) {
    // No remote branch - needs push
    return "needs-push";
  }

  // Check for uncommitted changes
  const status = await $`git status --porcelain`.quiet();
  const currentBranch = await getCurrentBranch();
  const hasLocalChanges =
    currentBranch === branchName && status.stdout.toString().trim().length > 0;

  if (hasLocalChanges) {
    return "needs-push";
  }

  // Compare local and remote
  const localRef = await $`git rev-parse ${branchName}`.quiet();
  const localHash = localRef.stdout.toString().trim();
  const remoteHash = remoteRef.stdout.toString().trim();

  if (localHash === remoteHash) {
    return "up-to-date";
  }

  // Check if local is ahead, behind, or diverged
  const mergeBase =
    await $`git merge-base ${branchName} origin/${branchName}`.quiet();
  const base = mergeBase.stdout.toString().trim();

  if (base === remoteHash) {
    // Local is ahead of remote
    return "needs-push";
  } else if (base === localHash) {
    // Local is behind remote
    return "needs-rebase";
  } else {
    // Branches have diverged - might have conflicts
    return "conflicts";
  }
}

async function getBranchPRInfo(
  branchName: string,
  ghAuthenticated: boolean
): Promise<{ prNumber: number | null; prStatus: PRStatus }> {
  if (!ghAuthenticated) {
    return { prNumber: null, prStatus: "none" };
  }

  const result =
    await $`gh pr view ${branchName} --json number,state,isDraft`.nothrow().quiet();

  if (result.exitCode !== 0) {
    return { prNumber: null, prStatus: "none" };
  }

  try {
    const pr = JSON.parse(result.stdout.toString());
    let prStatus: PRStatus = "none";

    if (pr.isDraft) {
      prStatus = "draft";
    } else if (pr.state === "OPEN") {
      prStatus = "open";
    } else if (pr.state === "MERGED") {
      prStatus = "merged";
    } else if (pr.state === "CLOSED") {
      prStatus = "closed";
    }

    return { prNumber: pr.number, prStatus };
  } catch {
    return { prNumber: null, prStatus: "none" };
  }
}

async function getStacksWithInfo(
  config: StackboiConfig,
  ghAuthenticated: boolean
): Promise<StackWithInfo[]> {
  const result: StackWithInfo[] = [];

  for (const stack of config.stacks) {
    const branches: BranchInfo[] = [];

    for (const branchName of stack.branches) {
      const [syncStatus, prInfo] = await Promise.all([
        getBranchSyncStatus(branchName),
        getBranchPRInfo(branchName, ghAuthenticated),
      ]);

      branches.push({
        name: branchName,
        prNumber: prInfo.prNumber,
        prStatus: prInfo.prStatus,
        syncStatus,
      });
    }

    result.push({ stack, branches });
  }

  return result;
}

// Fetch only PR status for all branches (used for polling)
async function fetchAllPRStatuses(
  stacks: StackWithInfo[],
  ghAuthenticated: boolean
): Promise<Map<string, { prNumber: number | null; prStatus: PRStatus }>> {
  const result = new Map<string, { prNumber: number | null; prStatus: PRStatus }>();

  // Collect all branch names
  const allBranches: string[] = [];
  for (const stackInfo of stacks) {
    for (const branch of stackInfo.branches) {
      allBranches.push(branch.name);
    }
  }

  // Fetch PR info for all branches in parallel
  const prInfoPromises = allBranches.map(async (branchName) => {
    const info = await getBranchPRInfo(branchName, ghAuthenticated);
    return { branchName, info };
  });

  const prInfoResults = await Promise.all(prInfoPromises);
  for (const { branchName, info } of prInfoResults) {
    result.set(branchName, info);
  }

  return result;
}

// Apply PR status updates to stacks and detect newly merged PRs
function applyPRStatusUpdates(
  stacks: StackWithInfo[],
  prStatuses: Map<string, { prNumber: number | null; prStatus: PRStatus }>
): { updated: StackWithInfo[]; hasChanges: boolean; newlyMerged: MergedPRNotification[] } {
  let hasChanges = false;
  const newlyMerged: MergedPRNotification[] = [];

  const updated = stacks.map((stackInfo) => ({
    ...stackInfo,
    branches: stackInfo.branches.map((branch, branchIndex) => {
      const newStatus = prStatuses.get(branch.name);
      if (newStatus && (newStatus.prNumber !== branch.prNumber || newStatus.prStatus !== branch.prStatus)) {
        hasChanges = true;

        // Detect newly merged PRs (was open/draft, now merged)
        if (
          newStatus.prStatus === "merged" &&
          (branch.prStatus === "open" || branch.prStatus === "draft") &&
          newStatus.prNumber !== null
        ) {
          // Find child branches (branches after this one in the stack)
          const childBranches = stackInfo.branches
            .slice(branchIndex + 1)
            .map((b) => b.name);

          newlyMerged.push({
            branchName: branch.name,
            prNumber: newStatus.prNumber,
            childBranches,
            stackName: stackInfo.stack.name,
          });
        }

        return {
          ...branch,
          prNumber: newStatus.prNumber,
          prStatus: newStatus.prStatus,
        };
      }
      return branch;
    }),
  }));

  return { updated, hasChanges, newlyMerged };
}

// Perform sync operation: fetch, rebase with --update-refs, and update metadata
export async function performSync(
  notification: MergedPRNotification,
  onProgress: (progress: SyncProgress) => void
): Promise<{ success: boolean; error?: string }> {
  const { branchName: mergedBranch, childBranches, stackName } = notification;

  // Initial progress
  onProgress({
    state: "fetching",
    message: "Fetching latest from remote...",
    mergedBranch,
    childBranches,
    currentBranch: null,
    error: null,
  });

  // Step 1: Fetch latest from remote
  const fetchResult = await $`git fetch origin`.quiet().nothrow();
  if (fetchResult.exitCode !== 0) {
    const error = `Failed to fetch from remote: ${fetchResult.stderr.toString()}`;
    onProgress({
      state: "error",
      message: error,
      mergedBranch,
      childBranches,
      currentBranch: null,
      error,
    });
    return { success: false, error };
  }

  // Step 2: Get the git root and load config
  const gitRoot = await getGitRoot();
  const config = await loadConfig(gitRoot);

  // Find the stack containing the merged branch
  const stackInfo = config.stacks.find((s) => s.name === stackName);
  if (!stackInfo) {
    const error = `Stack '${stackName}' not found in config`;
    onProgress({
      state: "error",
      message: error,
      mergedBranch,
      childBranches,
      currentBranch: null,
      error,
    });
    return { success: false, error };
  }

  // Step 3: If there are child branches, rebase them with --update-refs
  if (childBranches.length > 0) {
    // Get the first child branch (the one directly after the merged branch)
    const firstChildBranch = childBranches[0]!;

    // The tip branch is the last branch in the child list (furthest from base)
    const tipBranch = childBranches[childBranches.length - 1]!;

    onProgress({
      state: "rebasing",
      message: `Rebasing child branches onto ${stackInfo.baseBranch}...`,
      mergedBranch,
      childBranches,
      currentBranch: firstChildBranch,
      error: null,
    });

    // Save current branch to return to later
    const currentBranchResult = await $`git branch --show-current`.quiet();
    const originalBranch = currentBranchResult.stdout.toString().trim();

    // Checkout the tip branch for rebasing
    const checkoutResult = await $`git checkout ${tipBranch}`.quiet().nothrow();
    if (checkoutResult.exitCode !== 0) {
      const error = `Failed to checkout ${tipBranch}: ${checkoutResult.stderr.toString()}`;
      onProgress({
        state: "error",
        message: error,
        mergedBranch,
        childBranches,
        currentBranch: tipBranch,
        error,
      });
      return { success: false, error };
    }

    // Perform rebase with --update-refs
    // This rebases onto the base branch (since merged branch is now part of base)
    // --update-refs automatically updates all intermediate branch pointers
    const rebaseResult =
      await $`git rebase --update-refs origin/${stackInfo.baseBranch}`.quiet().nothrow();

    if (rebaseResult.exitCode !== 0) {
      // Check if it's a conflict
      const stderr = rebaseResult.stderr.toString();
      const isConflict = stderr.includes("CONFLICT") || stderr.includes("could not apply");

      if (isConflict) {
        // Abort the rebase so user is not left in conflicted state
        await $`git rebase --abort`.quiet().nothrow();
        const error = "Rebase failed due to conflicts. Please resolve manually.";
        onProgress({
          state: "error",
          message: error,
          mergedBranch,
          childBranches,
          currentBranch: tipBranch,
          error,
        });
        // Return to original branch
        await $`git checkout ${originalBranch}`.quiet().nothrow();
        return { success: false, error };
      }

      const error = `Rebase failed: ${stderr}`;
      onProgress({
        state: "error",
        message: error,
        mergedBranch,
        childBranches,
        currentBranch: tipBranch,
        error,
      });
      // Try to abort and return to original branch
      await $`git rebase --abort`.quiet().nothrow();
      await $`git checkout ${originalBranch}`.quiet().nothrow();
      return { success: false, error };
    }

    // Return to original branch if it still exists
    if (originalBranch && originalBranch !== mergedBranch) {
      await $`git checkout ${originalBranch}`.quiet().nothrow();
    } else {
      // If we were on the merged branch, switch to the first child
      await $`git checkout ${firstChildBranch}`.quiet().nothrow();
    }
  }

  // Step 4: Remove merged branch from stack metadata
  const mergedBranchIndex = stackInfo.branches.indexOf(mergedBranch);
  if (mergedBranchIndex !== -1) {
    stackInfo.branches.splice(mergedBranchIndex, 1);
    await saveConfig(gitRoot, config);
  }

  // Step 5: Delete the local merged branch (optional but good cleanup)
  await $`git branch -d ${mergedBranch}`.quiet().nothrow();

  onProgress({
    state: "success",
    message: "Sync completed successfully!",
    mergedBranch,
    childBranches,
    currentBranch: null,
    error: null,
  });

  return { success: true };
}

// Sync progress overlay component
function SyncProgressOverlay({ progress }: { progress: SyncProgress }) {
  const stateIcons: Record<SyncState, string> = {
    idle: "",
    fetching: "📥",
    rebasing: "🔄",
    success: "✅",
    error: "❌",
  };

  const stateColors: Record<SyncState, string> = {
    idle: "gray",
    fetching: "cyan",
    rebasing: "yellow",
    success: "green",
    error: "red",
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={stateColors[progress.state]} padding={1}>
      <Box marginBottom={1}>
        <Text bold color={stateColors[progress.state]}>
          {stateIcons[progress.state]} Syncing Stack
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{progress.message}</Text>
      </Box>

      {progress.state === "rebasing" && progress.childBranches.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">Rebasing branches:</Text>
          {progress.childBranches.map((branch) => (
            <Text key={branch} color={branch === progress.currentBranch ? "yellow" : "gray"}>
              {"  "}{branch === progress.currentBranch ? "→ " : "  "}{branch}
            </Text>
          ))}
        </Box>
      )}

      {progress.state === "success" && (
        <Box>
          <Text color="green">
            Removed <Text bold>{progress.mergedBranch}</Text> from stack.
          </Text>
        </Box>
      )}

      {progress.state === "error" && progress.error && (
        <Box marginTop={1}>
          <Text color="red">{progress.error}</Text>
        </Box>
      )}

      {(progress.state === "success" || progress.state === "error") && (
        <Box marginTop={1}>
          <Text color="gray">Press any key to continue...</Text>
        </Box>
      )}
    </Box>
  );
}

// Status indicator component
function StatusIndicator({ status }: { status: SyncStatus }) {
  const indicators: Record<SyncStatus, { symbol: string; color: string }> = {
    "up-to-date": { symbol: "✓", color: "green" },
    "needs-push": { symbol: "↑", color: "yellow" },
    "needs-rebase": { symbol: "↓", color: "yellow" },
    conflicts: { symbol: "✗", color: "red" },
    "pending-sync": { symbol: "⟲", color: "cyan" },
    unknown: { symbol: "?", color: "gray" },
  };

  const { symbol, color } = indicators[status];
  return <Text color={color}>{symbol}</Text>;
}

// PR badge component
function PRBadge({ prNumber, prStatus }: { prNumber: number | null; prStatus: PRStatus }) {
  if (prNumber === null) {
    return <Text color="gray">[no PR]</Text>;
  }

  const colors: Record<PRStatus, string> = {
    open: "green",
    merged: "magenta",
    closed: "red",
    draft: "gray",
    none: "gray",
  };

  return (
    <Text color={colors[prStatus]}>
      [#{prNumber}]
    </Text>
  );
}

// Branch node component
function BranchNode({
  branch,
  isLast,
  isSelected,
  isCurrent,
}: {
  branch: BranchInfo;
  isLast: boolean;
  isSelected: boolean;
  isCurrent: boolean;
}) {
  const prefix = isLast
    ? `${TREE_CHARS.lastBranch}${TREE_CHARS.horizontal}`
    : `${TREE_CHARS.branch}${TREE_CHARS.horizontal}`;

  return (
    <Box>
      <Text color="gray">{prefix} </Text>
      {isSelected && <Text color="cyan">&gt; </Text>}
      <Text bold={isCurrent} color={isCurrent ? "cyan" : undefined}>
        {branch.name}
      </Text>
      <Text> </Text>
      <PRBadge prNumber={branch.prNumber} prStatus={branch.prStatus} />
      <Text> </Text>
      <StatusIndicator status={branch.syncStatus} />
    </Box>
  );
}

// Stack tree component
function StackTree({
  stackInfo,
  currentBranch,
  selectedIndex,
  stackOffset,
}: {
  stackInfo: StackWithInfo;
  currentBranch: string;
  selectedIndex: number;
  stackOffset: number;
}) {
  const { stack, branches } = stackInfo;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="blue">
          {stack.name}
        </Text>
        <Text color="gray"> (base: {stack.baseBranch})</Text>
      </Box>
      {branches.map((branch, idx) => (
        <BranchNode
          key={branch.name}
          branch={branch}
          isLast={idx === branches.length - 1}
          isSelected={selectedIndex === stackOffset + idx}
          isCurrent={branch.name === currentBranch}
        />
      ))}
    </Box>
  );
}

// Navigation item for tracking
interface NavItem {
  type: "branch";
  stackIndex: number;
  branchIndex: number;
  branchName: string;
}

function buildNavItems(stacks: StackWithInfo[]): NavItem[] {
  const items: NavItem[] = [];

  for (let stackIdx = 0; stackIdx < stacks.length; stackIdx++) {
    const stack = stacks[stackIdx]!;
    for (let branchIdx = 0; branchIdx < stack.branches.length; branchIdx++) {
      items.push({
        type: "branch",
        stackIndex: stackIdx,
        branchIndex: branchIdx,
        branchName: stack.branches[branchIdx]!.name,
      });
    }
  }

  return items;
}

// Rerere status component
function RerereStatus({ stats }: { stats: RerereStats | null }) {
  if (!stats) {
    return null;
  }

  return (
    <Box>
      <Text color="gray">rerere: </Text>
      <Text color={stats.trainedResolutions > 0 ? "green" : "gray"}>
        {stats.trainedResolutions} trained resolution{stats.trainedResolutions !== 1 ? "s" : ""}
      </Text>
    </Box>
  );
}

// Main tree view component
function TreeView({
  stacks,
  currentBranch,
  onSelect,
  isPolling,
  rerereStats,
}: {
  stacks: StackWithInfo[];
  currentBranch: string;
  onSelect: (branchName: string) => void;
  isPolling: boolean;
  rerereStats: RerereStats | null;
}) {
  const { exit } = useApp();
  const navItems = buildNavItems(stacks);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(navItems.length - 1, prev + 1));
    } else if (key.return) {
      const item = navItems[selectedIndex];
      if (item) {
        onSelect(item.branchName);
      }
    }
  });

  if (stacks.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No stacks found.</Text>
        <Text color="gray">Create one with: stackboi new &lt;branch-name&gt;</Text>
      </Box>
    );
  }

  // Calculate stack offsets for selection tracking
  let offset = 0;
  const stackOffsets: number[] = [];
  for (const stack of stacks) {
    stackOffsets.push(offset);
    offset += stack.branches.length;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Stack Tree View</Text>
        <Text color="gray"> (↑↓/jk: navigate, Enter: checkout, q: quit)</Text>
        {isPolling && <Text color="gray"> ⟳</Text>}
      </Box>

      {stacks.map((stackInfo, idx) => (
        <StackTree
          key={stackInfo.stack.name}
          stackInfo={stackInfo}
          currentBranch={currentBranch}
          selectedIndex={selectedIndex}
          stackOffset={stackOffsets[idx]!}
        />
      ))}

      <Box marginTop={1}>
        <Text color="gray">Legend: </Text>
        <Text color="green">✓</Text>
        <Text color="gray"> up-to-date  </Text>
        <Text color="yellow">↑</Text>
        <Text color="gray"> needs-push  </Text>
        <Text color="yellow">↓</Text>
        <Text color="gray"> needs-rebase  </Text>
        <Text color="red">✗</Text>
        <Text color="gray"> conflicts  </Text>
        <Text color="cyan">⟲</Text>
        <Text color="gray"> pending-sync</Text>
      </Box>

      <Box marginTop={1}>
        <RerereStatus stats={rerereStats} />
      </Box>
    </Box>
  );
}

// Merge notification overlay component
function MergeNotificationOverlay({
  notification,
  onSync,
  onDismiss,
}: {
  notification: MergedPRNotification;
  onSync: () => void;
  onDismiss: () => void;
}) {
  useInput((input) => {
    if (input.toLowerCase() === "y") {
      onSync();
    } else if (input.toLowerCase() === "n") {
      onDismiss();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🔀 PR Merged!
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          <Text color="magenta">#{notification.prNumber}</Text>
          <Text> </Text>
          <Text bold>{notification.branchName}</Text>
          <Text color="gray"> in stack </Text>
          <Text color="blue">{notification.stackName}</Text>
          <Text color="gray"> was merged.</Text>
        </Text>
      </Box>

      {notification.childBranches.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">Affected child branches that need syncing:</Text>
          {notification.childBranches.map((branch) => (
            <Text key={branch} color="yellow">
              {"  "}• {branch}
            </Text>
          ))}
        </Box>
      )}

      {notification.childBranches.length === 0 && (
        <Box marginBottom={1}>
          <Text color="gray">No child branches need syncing.</Text>
        </Box>
      )}

      <Box>
        <Text bold>Sync now? </Text>
        <Text color="green">[Y]</Text>
        <Text>es / </Text>
        <Text color="red">[N]</Text>
        <Text>o</Text>
      </Box>
    </Box>
  );
}

// Loading state component
function Loading() {
  return (
    <Box>
      <Text color="gray">Loading stack info...</Text>
    </Box>
  );
}

// Error component
function ErrorDisplay({ message }: { message: string }) {
  return (
    <Box>
      <Text color="red">Error: {message}</Text>
    </Box>
  );
}

// Sync progress dismiss handler component
function SyncProgressWithDismiss({
  progress,
  onDismiss,
}: {
  progress: SyncProgress;
  onDismiss: () => void;
}) {
  useInput(() => {
    if (progress.state === "success" || progress.state === "error") {
      onDismiss();
    }
  });

  return <SyncProgressOverlay progress={progress} />;
}

// Main app component
function App() {
  const { exit } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stacks, setStacks] = useState<StackWithInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [ghAuthenticated, setGhAuthenticated] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(DEFAULT_POLL_INTERVAL_MS);
  const [isPolling, setIsPolling] = useState(false);
  const [mergeNotification, setMergeNotification] = useState<MergedPRNotification | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [rerereStats, setRerereStats] = useState<RerereStats | null>(null);

  // Initial load
  useEffect(() => {
    async function load() {
      try {
        const [branch, gitRoot, authenticated, stats] = await Promise.all([
          getCurrentBranch(),
          getGitRoot(),
          checkGhAuth(),
          getRerereStats(),
        ]);

        setCurrentBranch(branch);
        setGhAuthenticated(authenticated);
        setRerereStats(stats);
        const config = await loadConfig(gitRoot);
        setPollIntervalMs(config.settings.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
        const stacksWithInfo = await getStacksWithInfo(config, authenticated);
        setStacks(stacksWithInfo);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }

    load();
  }, []);

  // Poll for PR status updates
  useEffect(() => {
    if (loading || !ghAuthenticated || stacks.length === 0) {
      return;
    }

    const pollPRStatus = async () => {
      setIsPolling(true);
      try {
        const prStatuses = await fetchAllPRStatuses(stacks, ghAuthenticated);
        const { updated, hasChanges, newlyMerged } = applyPRStatusUpdates(stacks, prStatuses);
        if (hasChanges) {
          setStacks(updated);
        }
        // Show notification for first newly merged PR (queue additional ones if needed)
        if (newlyMerged.length > 0 && !mergeNotification) {
          setMergeNotification(newlyMerged[0]!);
        }
      } catch {
        // Silently ignore polling errors - don't disrupt the UI
      } finally {
        setIsPolling(false);
      }
    };

    const intervalId = setInterval(pollPRStatus, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [loading, ghAuthenticated, stacks, pollIntervalMs, mergeNotification]);

  const handleSelect = async (branchName: string) => {
    if (branchName === currentBranch) {
      return;
    }

    setCheckingOut(branchName);
    try {
      await $`git checkout ${branchName}`.quiet();
      setCurrentBranch(branchName);
    } catch (err) {
      setError(`Failed to checkout: ${err instanceof Error ? err.message : String(err)}`);
    }
    setCheckingOut(null);
  };

  // Handle sync request from merge notification
  const handleSync = async () => {
    if (!mergeNotification) return;

    const notification = mergeNotification;
    setMergeNotification(null);

    // Start the sync operation
    await performSync(notification, (progress) => {
      setSyncProgress(progress);
    });
  };

  // Handle dismissal of sync progress overlay
  const handleSyncProgressDismiss = async () => {
    const progress = syncProgress;
    setSyncProgress(null);

    // Reload stacks after successful sync
    if (progress?.state === "success") {
      try {
        const gitRoot = await getGitRoot();
        const config = await loadConfig(gitRoot);
        const updatedStacks = await getStacksWithInfo(config, ghAuthenticated);
        setStacks(updatedStacks);
        const branch = await getCurrentBranch();
        setCurrentBranch(branch);
      } catch {
        // Ignore errors during reload
      }
    }
  };

  // Handle dismissal of merge notification - mark child branches as pending-sync
  const handleDismissMergeNotification = () => {
    if (mergeNotification) {
      // Mark child branches with pending-sync status
      setStacks((prev) =>
        prev.map((stackInfo) => ({
          ...stackInfo,
          branches: stackInfo.branches.map((branch) => {
            if (mergeNotification.childBranches.includes(branch.name)) {
              return { ...branch, syncStatus: "pending-sync" as SyncStatus };
            }
            return branch;
          }),
        }))
      );
    }
    setMergeNotification(null);
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  if (checkingOut) {
    return (
      <Box>
        <Text color="yellow">Checking out {checkingOut}...</Text>
      </Box>
    );
  }

  if (syncProgress) {
    return (
      <SyncProgressWithDismiss
        progress={syncProgress}
        onDismiss={handleSyncProgressDismiss}
      />
    );
  }

  if (mergeNotification) {
    return (
      <MergeNotificationOverlay
        notification={mergeNotification}
        onSync={handleSync}
        onDismiss={handleDismissMergeNotification}
      />
    );
  }

  return (
    <TreeView
      stacks={stacks}
      currentBranch={currentBranch}
      onSelect={handleSelect}
      isPolling={isPolling}
      rerereStats={rerereStats}
    />
  );
}

export async function view(): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error("Not a git repository");
  }

  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}
