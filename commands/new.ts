import { $ } from 'bun'
import { type StackboiConfig, type Stack, CONFIG_FILE, getGitRoot, isGitRepo } from './init'

export interface NewStackOptions {
  branchName?: string
  baseBranch?: string
}

export async function loadConfig(gitRoot: string): Promise<StackboiConfig> {
  const configPath = `${gitRoot}/${CONFIG_FILE}`
  const file = Bun.file(configPath)

  if (!(await file.exists())) {
    throw new Error(`${CONFIG_FILE} not found. Run 'stackboi init' first.`)
  }

  return file.json()
}

export async function saveConfig(gitRoot: string, config: StackboiConfig): Promise<void> {
  const configPath = `${gitRoot}/${CONFIG_FILE}`
  await Bun.write(configPath, JSON.stringify(config, null, 2) + '\n')
}

export async function getCurrentBranch(): Promise<string> {
  const result = await $`git branch --show-current`.quiet()
  return result.stdout.toString().trim()
}

export async function branchExists(branchName: string): Promise<boolean> {
  const result = await $`git show-ref --verify --quiet refs/heads/${branchName}`.quiet().nothrow()
  return result.exitCode === 0
}

export function findStackByBranch(config: StackboiConfig, branchName: string): Stack | undefined {
  return config.stacks.find(
    (stack) => stack.baseBranch === branchName || stack.branches.includes(branchName),
  )
}

export function generateStackName(branchName: string): string {
  return `stack-${branchName}`
}

export function validateBranchName(name: string): void {
  if (!name || name.trim() === '') {
    throw new Error('Branch name cannot be empty')
  }

  // Git branch name rules
  if (name.startsWith('-')) {
    throw new Error('Branch name cannot start with a hyphen')
  }
  if (name.endsWith('.lock')) {
    throw new Error('Branch name cannot end with .lock')
  }
  if (name.includes('..')) {
    throw new Error("Branch name cannot contain '..'")
  }
  if (name.includes(' ') || name.includes('~') || name.includes('^')) {
    throw new Error('Branch name cannot contain spaces, ~, or ^')
  }
  if (name.includes(':') || name.includes('?') || name.includes('*')) {
    throw new Error('Branch name cannot contain :, ?, or *')
  }
  if (name.includes('[') || name.includes('\\')) {
    throw new Error('Branch name cannot contain [ or \\')
  }
}

async function promptBranchName(): Promise<string> {
  process.stdout.write('Enter branch name: ')
  for await (const line of Bun.stdin.stream()) {
    const decoder = new TextDecoder()
    return decoder.decode(line).trim()
  }
  throw new Error('No input received')
}

export async function newStack(options?: NewStackOptions): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error('Not a git repository')
  }

  const gitRoot = await getGitRoot()
  const config = await loadConfig(gitRoot)

  // Determine base branch (current branch becomes base)
  const baseBranch = options?.baseBranch ?? (await getCurrentBranch())

  // Get branch name from options or prompt
  let branchName = options?.branchName
  if (!branchName) {
    branchName = await promptBranchName()
  }

  validateBranchName(branchName)

  // Check if branch already exists
  if (await branchExists(branchName)) {
    throw new Error(`Branch '${branchName}' already exists`)
  }

  // Check if branch is already in a stack
  const existingStack = findStackByBranch(config, branchName)
  if (existingStack) {
    throw new Error(`Branch '${branchName}' is already part of stack '${existingStack.name}'`)
  }

  // Generate stack name from branch name
  const stackName = generateStackName(branchName)

  // Check if stack name already exists
  if (config.stacks.some((s) => s.name === stackName)) {
    throw new Error(`Stack '${stackName}' already exists`)
  }

  // Create new stack entry
  const newStackEntry: Stack = {
    name: stackName,
    baseBranch,
    branches: [branchName],
  }

  // Create the git branch
  await $`git checkout -b ${branchName}`.quiet()

  // Add stack to config and save
  config.stacks.push(newStackEntry)
  await saveConfig(gitRoot, config)

  console.log(`Created stack '${stackName}' with base branch '${baseBranch}'`)
  console.log(`Switched to branch '${branchName}'`)
}
