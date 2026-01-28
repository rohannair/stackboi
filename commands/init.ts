import { $ } from "bun";

export interface StackboiConfig {
  version: 1;
  stacks: Stack[];
  settings: Settings;
}

export interface Stack {
  name: string;
  baseBranch: string;
  branches: string[];
}

export interface Settings {
  rerere: {
    enabled: boolean;
    autoupdate: boolean;
  };
  defaultBaseBranch: string;
  pollIntervalMs: number;
}

export interface InitOptions {
  addToGitignore?: boolean;
}

export const CONFIG_FILE = ".stackboi.json";
const MIN_GIT_VERSION = { major: 2, minor: 38 };

export function parseGitVersion(versionStr: string): { major: number; minor: number } | null {
  const match = versionStr.match(/git version (\d+)\.(\d+)/);
  if (!match) return null;
  return { major: parseInt(match[1]!, 10), minor: parseInt(match[2]!, 10) };
}

export async function checkGitVersion(): Promise<void> {
  const result = await $`git --version`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error("Git is not installed or not in PATH");
  }

  const version = parseGitVersion(result.stdout.toString());
  if (!version) {
    throw new Error("Could not parse Git version");
  }

  if (
    version.major < MIN_GIT_VERSION.major ||
    (version.major === MIN_GIT_VERSION.major && version.minor < MIN_GIT_VERSION.minor)
  ) {
    throw new Error(
      `Git version ${MIN_GIT_VERSION.major}.${MIN_GIT_VERSION.minor}+ required for --update-refs support. ` +
        `Found: ${version.major}.${version.minor}`
    );
  }
}

export async function checkGhAuth(): Promise<boolean> {
  const result = await $`gh auth status`.quiet().nothrow();
  return result.exitCode === 0;
}

export async function isGitRepo(): Promise<boolean> {
  const result = await $`git rev-parse --is-inside-work-tree`.quiet().nothrow();
  return result.exitCode === 0;
}

export async function getGitRoot(): Promise<string> {
  const result = await $`git rev-parse --show-toplevel`.quiet();
  return result.stdout.toString().trim();
}

export async function getDefaultBranch(): Promise<string> {
  const result = await $`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null`.quiet().nothrow();
  if (result.exitCode === 0) {
    const ref = result.stdout.toString().trim();
    return ref.replace("refs/remotes/origin/", "");
  }
  return "main";
}

export const DEFAULT_POLL_INTERVAL_MS = 30_000;

export function createDefaultConfig(defaultBranch: string): StackboiConfig {
  return {
    version: 1,
    stacks: [],
    settings: {
      rerere: {
        enabled: true,
        autoupdate: true,
      },
      defaultBaseBranch: defaultBranch,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    },
  };
}

async function promptYesNo(question: string): Promise<boolean> {
  process.stdout.write(`${question} [y/N] `);
  for await (const line of Bun.stdin.stream()) {
    const decoder = new TextDecoder();
    const answer = decoder.decode(line).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  }
  return false;
}

export async function addToGitignore(gitRoot: string): Promise<void> {
  const gitignorePath = `${gitRoot}/.gitignore`;
  const file = Bun.file(gitignorePath);

  let content = "";
  if (await file.exists()) {
    content = await file.text();
    if (content.includes(CONFIG_FILE)) {
      return;
    }
  }

  const newContent = content.endsWith("\n") || content === "" ? content : content + "\n";
  await Bun.write(gitignorePath, newContent + `${CONFIG_FILE}\n`);
  console.log(`Added ${CONFIG_FILE} to .gitignore`);
}

export async function init(options?: InitOptions): Promise<void> {
  if (!(await isGitRepo())) {
    throw new Error("Not a git repository. Run 'git init' first.");
  }

  await checkGitVersion();

  const ghAuthenticated = await checkGhAuth();
  if (!ghAuthenticated) {
    console.warn("Warning: gh CLI is not authenticated. Some features will be unavailable.");
    console.warn("Run 'gh auth login' to authenticate.");
  }

  const gitRoot = await getGitRoot();
  const configPath = `${gitRoot}/${CONFIG_FILE}`;
  const configFile = Bun.file(configPath);

  if (await configFile.exists()) {
    throw new Error(`${CONFIG_FILE} already exists. Remove it first to reinitialize.`);
  }

  const defaultBranch = await getDefaultBranch();
  const config = createDefaultConfig(defaultBranch);

  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Created ${CONFIG_FILE}`);

  const shouldAddToGitignore =
    options?.addToGitignore !== undefined
      ? options.addToGitignore
      : await promptYesNo(`Add ${CONFIG_FILE} to .gitignore?`);

  if (shouldAddToGitignore) {
    await addToGitignore(gitRoot);
  }

  console.log("\nstackboi initialized successfully!");
}
