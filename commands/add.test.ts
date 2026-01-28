import { test, expect, describe } from "bun:test";
import { findStackByBranch } from "./new";
import type { StackboiConfig, Stack } from "./init";

describe("addBranch", () => {
  const createMockConfig = (stacks: Stack[]): StackboiConfig => ({
    version: 1,
    stacks,
    settings: {
      rerere: { enabled: true, autoupdate: true },
      defaultBaseBranch: "main",
      pollIntervalMs: 30000,
    },
  });

  describe("branch insertion order", () => {
    test("finds correct stack for branch in branches array", () => {
      const config = createMockConfig([
        {
          name: "stack-feature",
          baseBranch: "main",
          branches: ["feature-1", "feature-2"],
        },
      ]);

      const stack = findStackByBranch(config, "feature-1");
      expect(stack?.name).toBe("stack-feature");
    });

    test("finds correct stack when on base branch", () => {
      const config = createMockConfig([
        {
          name: "stack-feature",
          baseBranch: "main",
          branches: ["feature-1"],
        },
      ]);

      // When on base branch, findStackByBranch returns the stack
      const stack = findStackByBranch(config, "main");
      expect(stack?.name).toBe("stack-feature");
    });

    test("inserting after first branch in stack", () => {
      const stack: Stack = {
        name: "stack-feature",
        baseBranch: "main",
        branches: ["feature-1", "feature-2"],
      };

      // Simulate adding branch after feature-1
      const currentBranch = "feature-1";
      const newBranch = "feature-1a";
      const currentIndex = stack.branches.indexOf(currentBranch);
      stack.branches.splice(currentIndex + 1, 0, newBranch);

      expect(stack.branches).toEqual(["feature-1", "feature-1a", "feature-2"]);
    });

    test("inserting after last branch in stack", () => {
      const stack: Stack = {
        name: "stack-feature",
        baseBranch: "main",
        branches: ["feature-1", "feature-2"],
      };

      // Simulate adding branch after feature-2
      const currentBranch = "feature-2";
      const newBranch = "feature-3";
      const currentIndex = stack.branches.indexOf(currentBranch);
      stack.branches.splice(currentIndex + 1, 0, newBranch);

      expect(stack.branches).toEqual(["feature-1", "feature-2", "feature-3"]);
    });

    test("inserting when on base branch adds to beginning", () => {
      const stack: Stack = {
        name: "stack-feature",
        baseBranch: "main",
        branches: ["feature-1"],
      };

      // Simulate adding branch when on base branch (not in branches array)
      const currentBranch = "main";
      const newBranch = "feature-0";
      const currentIndex = stack.branches.indexOf(currentBranch);

      if (currentIndex === -1) {
        stack.branches.unshift(newBranch);
      }

      expect(stack.branches).toEqual(["feature-0", "feature-1"]);
    });
  });

  describe("error conditions", () => {
    test("returns undefined when branch not in any stack", () => {
      const config = createMockConfig([
        {
          name: "stack-feature",
          baseBranch: "main",
          branches: ["feature-1"],
        },
      ]);

      const stack = findStackByBranch(config, "unrelated-branch");
      expect(stack).toBeUndefined();
    });

    test("returns undefined with empty stacks", () => {
      const config = createMockConfig([]);

      const stack = findStackByBranch(config, "any-branch");
      expect(stack).toBeUndefined();
    });
  });
});
