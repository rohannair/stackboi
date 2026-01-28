import { test, expect, describe } from 'bun:test'
import { validateBranchName, generateStackName, findStackByBranch } from './new'
import type { StackboiConfig } from './init'

describe('validateBranchName', () => {
  test('accepts valid branch names', () => {
    expect(() => validateBranchName('feature/my-feature')).not.toThrow()
    expect(() => validateBranchName('fix-123')).not.toThrow()
    expect(() => validateBranchName('user/rohan/experiment')).not.toThrow()
  })

  test('rejects empty branch name', () => {
    expect(() => validateBranchName('')).toThrow('cannot be empty')
    expect(() => validateBranchName('   ')).toThrow('cannot be empty')
  })

  test('rejects branch name starting with hyphen', () => {
    expect(() => validateBranchName('-feature')).toThrow('cannot start with a hyphen')
  })

  test('rejects branch name ending with .lock', () => {
    expect(() => validateBranchName('feature.lock')).toThrow('cannot end with .lock')
  })

  test('rejects branch name with double dots', () => {
    expect(() => validateBranchName('feature..test')).toThrow("cannot contain '..'")
  })

  test('rejects branch name with spaces', () => {
    expect(() => validateBranchName('my feature')).toThrow('cannot contain spaces')
  })

  test('rejects branch name with special characters', () => {
    expect(() => validateBranchName('feature~1')).toThrow('cannot contain')
    expect(() => validateBranchName('feature^2')).toThrow('cannot contain')
    expect(() => validateBranchName('feature:test')).toThrow('cannot contain')
    expect(() => validateBranchName('feature?')).toThrow('cannot contain')
    expect(() => validateBranchName('feature*')).toThrow('cannot contain')
    expect(() => validateBranchName('feature[1]')).toThrow('cannot contain')
    expect(() => validateBranchName('feature\\test')).toThrow('cannot contain')
  })
})

describe('generateStackName', () => {
  test('generates stack name from branch name', () => {
    expect(generateStackName('my-feature')).toBe('stack-my-feature')
    expect(generateStackName('fix-123')).toBe('stack-fix-123')
  })

  test('handles slashes in branch names', () => {
    expect(generateStackName('feature/auth')).toBe('stack-feature/auth')
  })
})

describe('findStackByBranch', () => {
  const mockConfig: StackboiConfig = {
    version: 1,
    stacks: [
      {
        name: 'stack-feature',
        baseBranch: 'main',
        branches: ['feature-1', 'feature-2'],
      },
      {
        name: 'stack-fix',
        baseBranch: 'develop',
        branches: ['fix-1'],
      },
    ],
    settings: {
      rerere: { enabled: true, autoupdate: true },
      defaultBaseBranch: 'main',
      pollIntervalMs: 30000,
    },
  }

  test('finds stack by branch in branches array', () => {
    const result = findStackByBranch(mockConfig, 'feature-1')
    expect(result?.name).toBe('stack-feature')
  })

  test('finds stack by base branch', () => {
    const result = findStackByBranch(mockConfig, 'develop')
    expect(result?.name).toBe('stack-fix')
  })

  test('returns undefined for non-existent branch', () => {
    const result = findStackByBranch(mockConfig, 'unknown-branch')
    expect(result).toBeUndefined()
  })

  test('returns undefined for empty config', () => {
    const emptyConfig: StackboiConfig = {
      version: 1,
      stacks: [],
      settings: {
        rerere: { enabled: true, autoupdate: true },
        defaultBaseBranch: 'main',
        pollIntervalMs: 30000,
      },
    }
    const result = findStackByBranch(emptyConfig, 'any-branch')
    expect(result).toBeUndefined()
  })
})
