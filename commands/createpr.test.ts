import { test, expect, describe } from 'bun:test'
import { getParentBranch, getStackPosition, generateTitleFromBranchName } from './createpr'
import type { Stack } from './init'

describe('getParentBranch', () => {
  const mockStack: Stack = {
    name: 'test-stack',
    baseBranch: 'main',
    branches: ['feature-1', 'feature-2', 'feature-3'],
  }

  test('returns base branch for first branch in stack', () => {
    expect(getParentBranch(mockStack, 'feature-1')).toBe('main')
  })

  test('returns previous branch for second branch', () => {
    expect(getParentBranch(mockStack, 'feature-2')).toBe('feature-1')
  })

  test('returns previous branch for third branch', () => {
    expect(getParentBranch(mockStack, 'feature-3')).toBe('feature-2')
  })

  test('returns base branch for unknown branch', () => {
    expect(getParentBranch(mockStack, 'unknown')).toBe('main')
  })
})

describe('getStackPosition', () => {
  const mockStack: Stack = {
    name: 'test-stack',
    baseBranch: 'main',
    branches: ['feature-1', 'feature-2', 'feature-3'],
  }

  test('returns correct position for first branch', () => {
    const { position, total } = getStackPosition(mockStack, 'feature-1')
    expect(position).toBe(1)
    expect(total).toBe(3)
  })

  test('returns correct position for second branch', () => {
    const { position, total } = getStackPosition(mockStack, 'feature-2')
    expect(position).toBe(2)
    expect(total).toBe(3)
  })

  test('returns correct position for third branch', () => {
    const { position, total } = getStackPosition(mockStack, 'feature-3')
    expect(position).toBe(3)
    expect(total).toBe(3)
  })

  test('returns 0 position for unknown branch', () => {
    const { position, total } = getStackPosition(mockStack, 'unknown')
    expect(position).toBe(0)
    expect(total).toBe(3)
  })
})

describe('generateTitleFromBranchName', () => {
  test('converts kebab-case to title case', () => {
    expect(generateTitleFromBranchName('add-user-auth')).toBe('Add User Auth')
  })

  test('converts snake_case to title case', () => {
    expect(generateTitleFromBranchName('add_user_auth')).toBe('Add User Auth')
  })

  test('removes feature/ prefix', () => {
    expect(generateTitleFromBranchName('feature/add-login')).toBe('Add Login')
  })

  test('removes feat/ prefix', () => {
    expect(generateTitleFromBranchName('feat/add-login')).toBe('Add Login')
  })

  test('removes fix/ prefix', () => {
    expect(generateTitleFromBranchName('fix/broken-auth')).toBe('Broken Auth')
  })

  test('removes bugfix/ prefix', () => {
    expect(generateTitleFromBranchName('bugfix/login-issue')).toBe('Login Issue')
  })

  test('removes hotfix/ prefix', () => {
    expect(generateTitleFromBranchName('hotfix/critical-bug')).toBe('Critical Bug')
  })

  test('removes chore/ prefix', () => {
    expect(generateTitleFromBranchName('chore/update-deps')).toBe('Update Deps')
  })

  test('removes refactor/ prefix', () => {
    expect(generateTitleFromBranchName('refactor/cleanup-code')).toBe('Cleanup Code')
  })

  test('removes docs/ prefix', () => {
    expect(generateTitleFromBranchName('docs/update-readme')).toBe('Update Readme')
  })

  test('handles single word branch names', () => {
    expect(generateTitleFromBranchName('auth')).toBe('Auth')
  })

  test('handles mixed separators', () => {
    expect(generateTitleFromBranchName('add-user_login')).toBe('Add User Login')
  })
})
