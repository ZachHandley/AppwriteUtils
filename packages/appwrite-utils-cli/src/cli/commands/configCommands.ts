import inquirer from "inquirer";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { migrateConfig } from "../../utils/configMigration.js";
import {
  validateCollectionsTablesConfig,
  reportValidationResults,
} from "../../config/configValidation.js";
import {
  createMigrationPlan,
  executeMigrationPlan,
  saveMigrationResult,
  type MigrationStrategy,
} from "../../config/configMigration.js";
import { createEmptyCollection } from "../../utils/setupFiles.js";
import chalk from "chalk";
import type { InteractiveCLI } from "../../interactiveCLI.js";

export const configCommands = {
  async migrateTypeScriptConfig(cli: InteractiveCLI): Promise<void> {
    try {
      MessageFormatter.info("Starting TypeScript to YAML configuration migration...", { prefix: "Migration" });

      // Perform the migration
      await migrateConfig((cli as any).currentDir);

      // Reset the detection flag
      (cli as any).isUsingTypeScriptConfig = false;

      // Reset the controller to pick up the new config
      (cli as any).controller = undefined;

      MessageFormatter.success("Migration completed successfully!", { prefix: "Migration" });
      MessageFormatter.info("Your configuration has been migrated to the .appwrite directory structure", { prefix: "Migration" });
      MessageFormatter.info("You can now use YAML configuration for easier management", { prefix: "Migration" });

    } catch (error) {
      MessageFormatter.error("Migration failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
    }
  },

  async validateConfiguration(cli: InteractiveCLI): Promise<void> {
    try {
      MessageFormatter.info("Starting configuration validation...", { prefix: "Validation" });

      await (cli as any).initControllerIfNeeded();
      const config = (cli as any).controller?.config;

      if (!config) {
        MessageFormatter.error("No configuration found to validate", undefined, { prefix: "Validation" });
        return;
      }

      const { validateCollectionsTablesConfig, reportValidationResults } = await import("../../config/configValidation.js");
      const validation = validateCollectionsTablesConfig(config);

      reportValidationResults(validation, { verbose: true });

      if (validation.isValid) {
        MessageFormatter.success("Configuration validation passed!", { prefix: "Validation" });
      } else {
        MessageFormatter.error("Configuration validation failed", undefined, { prefix: "Validation" });
      }

    } catch (error) {
      MessageFormatter.error("Validation failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Validation" });
    }
  },

  async migrateCollectionsToTables(cli: InteractiveCLI): Promise<void> {
    try {
      MessageFormatter.info("Starting collections to tables migration...", { prefix: "Migration" });

      await (cli as any).initControllerIfNeeded();

      // Ensure config is properly loaded with YAML collections
      if (!(cli as any).controller?.config) {
        MessageFormatter.error("No configuration found", undefined, { prefix: "Migration" });
        return;
      }

      // Check if collections exist
      if (!(cli as any).controller.config.collections || (cli as any).controller.config.collections.length === 0) {
        MessageFormatter.error("No collections found in configuration. Please check your YAML files or appwriteConfig.ts", undefined, { prefix: "Migration" });
        return;
      }

      const { createMigrationPlan, executeMigrationPlan, saveMigrationResult } = await import("../../config/configMigration.js");

      // Get user's migration strategy preference
      const { strategy } = await inquirer.prompt([
        {
          type: "list",
          name: "strategy",
          message: "Choose migration strategy:",
          choices: [
            { name: "Move files (rename collections/ to tables/)", value: "move" },
            { name: "Copy files (keep both collections/ and tables/)", value: "copy" },
            { name: "Dual format (create both .ts and .yaml versions)", value: "dual" }
          ]
        }
      ]);

      // Map user-friendly strategy names to internal MigrationStrategy types
      const migrationStrategy = strategy === "move" ? "full_migration" :
                               strategy === "copy" || strategy === "dual" ? "dual_format" : "full_migration";
      const plan = createMigrationPlan((cli as any).controller.config, migrationStrategy);

      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: `Proceed with migration? This will affect ${plan.collectionsToMigrate?.length || 0} files.`,
          default: false
        }
      ]);

      if (confirmed) {
        const result = executeMigrationPlan((cli as any).controller.config, plan);
        await saveMigrationResult(result, (cli as any).currentDir);

        MessageFormatter.success("Collections to tables migration completed!", { prefix: "Migration" });
      } else {
        MessageFormatter.info("Migration cancelled by user", { prefix: "Migration" });
      }

    } catch (error) {
      MessageFormatter.error("Migration failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Migration" });
    }
  },

  async createCollectionConfig(cli: InteractiveCLI): Promise<void> {
    const { collectionName } = await inquirer.prompt([
      {
        type: "input",
        name: "collectionName",
        message: chalk.blue("Enter the name of the collection:"),
        validate: (input) =>
          input.trim() !== "" || "Collection name cannot be empty.",
      },
    ]);
    MessageFormatter.progress(`Creating collection config file for '${collectionName}'...`, { prefix: "Collections" });
    createEmptyCollection(collectionName);
    MessageFormatter.success(`Collection config file created for '${collectionName}'`, { prefix: "Collections" });
  },

  async reloadConfigWithSessionPreservation(cli: InteractiveCLI): Promise<void> {
    MessageFormatter.progress("Reloading configuration files with session preservation...", { prefix: "Config" });
    try {
      const controller = (cli as any).controller;
      const UtilsController = (await import("../../utilsController.js")).UtilsController;

      if (controller) {
        const sessionInfo = controller.getSessionInfo();

        if (sessionInfo.hasSession) {
          // Extract session details for preservation
          const sessionData = {
            sessionCookie: controller.sessionCookie,
            sessionMetadata: controller.sessionMetadata
          };

          // Store current config values for potential directConfig creation
          const currentConfig = controller.config;
          let directConfig: any = undefined;

          if (currentConfig?.appwriteEndpoint && currentConfig?.appwriteProject) {
            directConfig = {
              appwriteEndpoint: currentConfig.appwriteEndpoint,
              appwriteProject: currentConfig.appwriteProject,
              appwriteKey: currentConfig.appwriteKey,
              ...sessionData // Preserve session
            };
          }

          // Reinitialize controller with session preservation
          (cli as any).controller = new UtilsController((cli as any).currentDir, directConfig);
          await (cli as any).controller.init();

          MessageFormatter.success("Configuration reloaded with session preserved", { prefix: "Config" });
        } else {
          // No session to preserve, standard reload
          await controller.reloadConfig();
          MessageFormatter.success("Configuration files reloaded successfully", { prefix: "Config" });
        }
      } else {
        // Initialize if no controller exists
        await (cli as any).initControllerIfNeeded();
        MessageFormatter.success("Configuration initialized successfully", { prefix: "Config" });
      }
    } catch (error) {
      MessageFormatter.error("Failed to reload configuration files", error instanceof Error ? error : new Error(String(error)), { prefix: "Config" });
    }
  }
};
