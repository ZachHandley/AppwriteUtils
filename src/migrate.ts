import { runMigrations } from "./migrationController";

const args = process.argv.slice(2);

const generateSchemas = async (includeMain: boolean = false) => {
  console.log("Generating TypeScript files from schemas...");
  // Assuming generating schemas doesn't require wiping databases, generating mock data, or importing data
  await runMigrations(includeMain, false, true, false, false, false);
  console.log("Schemas generated successfully.");
};

const applyMigrations = async (includeMain: boolean = false) => {
  console.log("Applying migrations...");
  // Assuming applying migrations doesn't require generating schemas or mock data, but does include importing data
  await runMigrations(includeMain, false, false, false, true, true);
  console.log("Migrations applied successfully.");
};

const wipeDatabase = async (includeMain: boolean = false) => {
  console.log("Wiping database...");
  await runMigrations(includeMain, true, false, false, false, false); // Adjust parameters as needed
  console.log("Database wiped successfully.");
};

const runProductionMigrations = async (includeMain: boolean = true) => {
  console.log("Running production migrations...");
  // Example: Running with includeMain=true, and assuming you want to generate schemas and import data without wiping the database
  await runMigrations(includeMain, false, true, false, true, true);
  console.log("Production migrations completed successfully.");
};

const runCommand = async () => {
  let includeMain = !args.includes("--dev");
  console.log(
    `Running command for ${includeMain ? "main" : "dev"} database...`
  );
  includeMain = false;
  if (args.includes("--generate")) {
    await generateSchemas(includeMain);
  } else if (args.includes("--apply")) {
    await applyMigrations(includeMain);
  } else if (args.includes("--wipe")) {
    await wipeDatabase(includeMain);
  } else if (args.includes("--prod")) {
    await runProductionMigrations(includeMain);
  } else {
    console.log("No valid command provided.");
  }
};

runCommand().catch((error) => {
  console.error("Operation failed:", error);
  process.exit(1);
});
