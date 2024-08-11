#!/usr/bin/env node
import { runInteractiveCLI } from "./interactiveCLI.js";

runInteractiveCLI().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
