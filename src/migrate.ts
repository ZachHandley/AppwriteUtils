import { runMigrations } from "./migrationController";

const args = process.argv.slice(2);

const generateSchemas = async () => {
  console.log("Generating TypeScript files from schemas...");
  // Assuming generating schemas doesn't require wiping databases, generating mock data, or importing data
  await runMigrations(false, false, true, false, false);
  console.log("Schemas generated successfully.");
};

const applyMigrations = async () => {
  console.log("Applying migrations...");
  // Assuming applying migrations doesn't require generating schemas or mock data, but does include importing data
  await runMigrations(false, false, false, false, true);
  console.log("Migrations applied successfully.");
};

const wipeDatabase = async () => {
  console.log("Wiping database...");
  await runMigrations(false, true, false, false, false); // Adjust parameters as needed
  console.log("Database wiped successfully.");
};

const runProductionMigrations = async () => {
  console.log("Running production migrations...");
  // Example: Running with includeMain=true, and assuming you want to generate schemas and import data without wiping the database
  await runMigrations(true, false, true, false, true);
  console.log("Production migrations completed successfully.");
};

const runCommand = async () => {
  if (args.includes("--generate")) {
    await generateSchemas();
  } else if (args.includes("--apply")) {
    await applyMigrations();
  } else if (args.includes("--wipe")) {
    await wipeDatabase();
  } else if (args.includes("--prod")) {
    await runProductionMigrations();
  } else {
    console.log("No valid command provided.");
  }
};

runCommand().catch((error) => {
  console.error("Operation failed:", error);
  process.exit(1);
});
