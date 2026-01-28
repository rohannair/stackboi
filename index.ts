#!/usr/bin/env bun

import { init } from "./commands/init";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "init":
      await init();
      break;
    case undefined:
    case "--help":
    case "-h":
      console.log(`stackboi - A stacked branch workflow tool

Usage: stackboi <command>

Commands:
  init    Initialize stackboi in the current repository
`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
