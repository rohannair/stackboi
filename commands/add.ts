import { $ } from 'bun'
import { getGitRoot, isGitRepo } from './init'
import {
  loadConfig,
  saveConfig,
  getCurrentBranch,
  branchExists,
  findStackByBranch,
  validateBranchName,
} from './new'

export interface AddBranchOptions {
  branchName?: string
}

async function promptBranchName(): Promise<string> {
  process.stdout.write('Enter branch name: ')
  for await (const line of Bun.stdin.stream()) {
    const decoder = new TextDecoder()
    return decoder.decode(line).trim()
  }
  throw new Error('No input received')
}

export async function addBranch(options?: AddBranchOptions): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error('Not a git repository')
  }

  const gitRoot = await getGitRoot()
  const config = await loadConfig(gitRoot)

  // Get current branch to find which stack we're in
  const currentBranch = await getCurrentBranch()

  // Find the stack containing the current branch
  const stack = findStackByBranch(config, currentBranch)
  if (!stack) {
    throw new Error(
      `Current branch '${currentBranch}' is not part of any stack. Use 'stackboi new' to create a new stack.`,
    )
  }

  // Get branch name from options or prompt
  let branchName = options?.branchName
  if (!branchName) {
    branchName = await promptBranchName()
  }

  validateBranchName(branchName)

  // Check if branch already exists in git
  if (await branchExists(branchName)) {
    throw new Error(`Branch '${branchName}' already exists`)
  }

  // Check if branch is already in a stack
  const existingStack = findStackByBranch(config, branchName)
  if (existingStack) {
    throw new Error(`Branch '${branchName}' is already part of stack '${existingStack.name}'`)
  }

  // Create the git branch from current HEAD
  await $`git checkout -b ${branchName}`.quiet()

  // Add branch to stack's branch list after current branch
  const currentBranchIndex = stack.branches.indexOf(currentBranch)
  if (currentBranchIndex === -1) {
    // Current branch is the base branch, add to beginning of branches array
    stack.branches.unshift(branchName)
  } else {
    // Insert after current branch position
    stack.branches.splice(currentBranchIndex + 1, 0, branchName)
  }

  await saveConfig(gitRoot, config)

  console.log(`Added branch '${branchName}' to stack '${stack.name}'`)
  console.log(`Parent branch: '${currentBranch}'`)
  console.log(`Switched to branch '${branchName}'`)
}
