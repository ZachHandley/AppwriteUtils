#!/usr/bin/env node
import { setupDirsFiles } from "./utils/setupFiles.js";

const args = process.argv.slice(2);

const genExample = args.includes("--example");

setupDirsFiles(genExample);
