import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { $ } from "bun";
import {
  type StackboiConfig,
  type Stack,
  getGitRoot,
  isGitRepo,
  checkGhAuth,
  DEFAULT_POLL_INTERVAL_MS,
} from "./init";
import { loadConfig, getCurrentBranch } from "./new";

// Sync status for a branch
export type SyncStatus =
  | "up-to-date"
  | "needs-push"
  | "needs-rebase"
  | "conflicts"
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

// Apply PR status updates to stacks
function applyPRStatusUpdates(
  stacks: StackWithInfo[],
  prStatuses: Map<string, { prNumber: number | null; prStatus: PRStatus }>
): { updated: StackWithInfo[]; hasChanges: boolean } {
  let hasChanges = false;
  const updated = stacks.map((stackInfo) => ({
    ...stackInfo,
    branches: stackInfo.branches.map((branch) => {
      const newStatus = prStatuses.get(branch.name);
      if (newStatus && (newStatus.prNumber !== branch.prNumber || newStatus.prStatus !== branch.prStatus)) {
        hasChanges = true;
        return {
          ...branch,
          prNumber: newStatus.prNumber,
          prStatus: newStatus.prStatus,
        };
      }
      return branch;
    }),
  }));
  return { updated, hasChanges };
}

// Status indicator component
function StatusIndicator({ status }: { status: SyncStatus }) {
  const indicators: Record<SyncStatus, { symbol: string; color: string }> = {
    "up-to-date": { symbol: "✓", color: "green" },
    "needs-push": { symbol: "↑", color: "yellow" },
    "needs-rebase": { symbol: "↓", color: "yellow" },
    conflicts: { symbol: "✗", color: "red" },
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

// Main tree view component
function TreeView({
  stacks,
  currentBranch,
  onSelect,
  isPolling,
}: {
  stacks: StackWithInfo[];
  currentBranch: string;
  onSelect: (branchName: string) => void;
  isPolling: boolean;
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
        <Text color="gray"> conflicts</Text>
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

  // Initial load
  useEffect(() => {
    async function load() {
      try {
        const [branch, gitRoot, authenticated] = await Promise.all([
          getCurrentBranch(),
          getGitRoot(),
          checkGhAuth(),
        ]);

        setCurrentBranch(branch);
        setGhAuthenticated(authenticated);
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
        const { updated, hasChanges } = applyPRStatusUpdates(stacks, prStatuses);
        if (hasChanges) {
          setStacks(updated);
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
  }, [loading, ghAuthenticated, stacks, pollIntervalMs]);

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

  return (
    <TreeView
      stacks={stacks}
      currentBranch={currentBranch}
      onSelect={handleSelect}
      isPolling={isPolling}
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
