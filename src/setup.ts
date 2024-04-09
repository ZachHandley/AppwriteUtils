import { setupDirsFiles } from "./utils/setupFiles";

const args = process.argv.slice(2);

const genExample = args.includes("--example");

setupDirsFiles(genExample);
