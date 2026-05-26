import inquirer from "inquirer";
import { join } from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ulid } from "ulidx";
import chalk from "chalk";
import { Query } from "node-appwrite";
import { MessageFormatter } from 'appwrite-utils-helpers';
import {
  createFunctionTemplate,
  deleteFunction,
  downloadLatestFunctionDeployment,
  listFunctions,
  listSpecifications,
} from "../../functions/methods.js";
import { deployLocalFunction } from "../../functions/deployments.js";
import { deployFunctionsBatch, type BatchDeployItem } from "../../functions/batchDeploy.js";
import { discoverFnConfigs, mergeDiscoveredFunctions } from "../../functions/fnConfigDiscovery.js";
import { addFunctionToYamlConfig, findYamlConfig } from "appwrite-utils-helpers";
import { RuntimeSchema, type AppwriteFunction, type Runtime, type Specification } from "appwrite-utils";
import type { InteractiveCLI } from "../../interactiveCLI.js";

export const functionCommands = {
  async createFunction(cli: InteractiveCLI): Promise<void> {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Function name:",
        validate: (input) => input.length > 0,
      },
    ]);

    const { template } = await inquirer.prompt([
      {
        type: "list",
        name: "template",
        message: "Select a template:",
        choices: [
          { name: "TypeScript Node.js", value: "typescript-node" },
          { name: "TypeScript with Hono Web Framework", value: "hono-typescript" },
          { name: "Python with UV", value: "uv" },
          { name: "Count Documents in Collection", value: "count-docs-in-collection" },
          { name: "None (Empty Function)", value: "none" },
        ],
      },
    ]);

    // Get template defaults
    const templateDefaults = (cli as any).getTemplateDefaults(template);

    const { runtime } = await inquirer.prompt([
      {
        type: "list",
        name: "runtime",
        message: "Select runtime:",
        choices: Object.values(RuntimeSchema.Values),
        default: templateDefaults.runtime,
      },
    ]);

    const specifications = await listSpecifications(
      (cli as any).controller!.appwriteServer!
    );
    const { specification } = await inquirer.prompt([
      {
        type: "list",
        name: "specification",
        message: "Select specification:",
        choices: [
          { name: "None", value: undefined },
          ...specifications.specifications.map((s: any) => ({
            name: s.slug,
            value: s.slug,
          })),
        ],
        default: templateDefaults.buildSpecification,
      },
    ]);

    const functionConfig: AppwriteFunction = {
      $id: ulid(),
      name,
      runtime,
      events: [],
      execute: ["any"],
      enabled: true,
      logging: true,
      entrypoint: templateDefaults.entrypoint,
      commands: templateDefaults.commands,
      buildSpecification: specification || templateDefaults.buildSpecification,
      runtimeSpecification: specification || templateDefaults.runtimeSpecification,
      scopes: [],
      timeout: 15,
      schedule: "",
      installationId: "",
      providerRepositoryId: "",
      providerBranch: "",
      providerSilentMode: false,
      providerRootDirectory: "",
      templateRepository: "",
      templateOwner: "",
      templateRootDirectory: "",
    };

    if (template !== "none") {
      await createFunctionTemplate(
        template as "typescript-node" | "uv" | "count-docs-in-collection" | "hono-typescript",
        name,
        "./functions"
      );
    }

    // Add to in-memory config
    if (!(cli as any).controller!.config!.functions) {
      (cli as any).controller!.config!.functions = [];
    }
    (cli as any).controller!.config!.functions.push(functionConfig);

    // If using YAML config, also add to YAML file
    const yamlConfigPath = findYamlConfig((cli as any).currentDir);
    if (yamlConfigPath) {
      try {
        await addFunctionToYamlConfig(yamlConfigPath, functionConfig);
      } catch (error) {
        MessageFormatter.warning(
          `Function created but failed to update YAML config: ${error instanceof Error ? error.message : error}`,
          { prefix: "Functions" }
        );
      }
    }

    MessageFormatter.success("Function created successfully!", { prefix: "Functions" });
  },

  async deployFunction(cli: InteractiveCLI): Promise<void> {
    await (cli as any).initControllerIfNeeded();
    if (!(cli as any).controller?.config) {
      MessageFormatter.error("Failed to initialize controller or load config", undefined, { prefix: "Functions" });
      return;
    }

    // Discover per-function .fnconfig.yaml definitions and merge with central list for selection
    // No global prompt; we'll handle conflicts per-function if both exist.
    let discovered: any[] = [];
    let central: any[] = (cli as any).controller!.config!.functions || [];
    try {
      discovered = discoverFnConfigs((cli as any).currentDir) as any[];
      const merged = mergeDiscoveredFunctions(central as any, discovered as any);
      (cli as any).controller!.config!.functions = merged as any;
    } catch {}

    const functions = await (cli as any).selectFunctions(
      "Select function(s) to deploy:",
      true,
      true
    );

    if (!functions?.length) {
      MessageFormatter.error("No function selected", undefined, { prefix: "Functions" });
      return;
    }

    const batchItems: BatchDeployItem[] = [];

    for (const functionConfig of functions) {
      if (!functionConfig) {
        MessageFormatter.error("Invalid function configuration", undefined, { prefix: "Functions" });
        return;
      }

      // Resolve effective config for this function (prefer per-function choice if both sources exist)
      const byIdOrName = (arr: any[]) => arr.find((f:any) => f?.$id === functionConfig.$id || f?.name === functionConfig.name);
      const centralDef = byIdOrName(central as any[]);
      const discoveredDef = byIdOrName(discovered as any[]);

      let effectiveConfig = functionConfig;
      if (centralDef && discoveredDef) {
        try {
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'cfgChoice',
              message: `Multiple configs found for '${functionConfig.name}'. Which to use?`,
              choices: [
                { name: 'config.yaml (central)', value: 'central' },
                { name: '.fnconfig.yaml (local file)', value: 'fnconfig' },
                { name: 'Merge (.fnconfig overrides central)', value: 'merge' },
              ],
              default: 'fnconfig'
            }
          ]);
          if (answer.cfgChoice === 'central') effectiveConfig = centralDef;
          else if (answer.cfgChoice === 'fnconfig') effectiveConfig = discoveredDef;
          else effectiveConfig = { ...centralDef, ...discoveredDef };
        } catch {}
      }

      // Ensure functions array exists
      if (!(cli as any).controller.config.functions) {
        (cli as any).controller.config.functions = [];
      }

      const functionNameLower = effectiveConfig.name
        .toLowerCase()
        .replace(/\s+/g, "-");

      // Debug logging
      MessageFormatter.info(`🔍 Function deployment debug:`, { prefix: "Functions" });
      MessageFormatter.info(`  Function name: ${effectiveConfig.name}`, { prefix: "Functions" });
      MessageFormatter.info(`  Function ID: ${effectiveConfig.$id}`, { prefix: "Functions" });
      MessageFormatter.info(`  Config dirPath: ${effectiveConfig.dirPath || 'undefined'}`, { prefix: "Functions" });
      if (effectiveConfig.dirPath) {
        const expandedPath = effectiveConfig.dirPath.startsWith('~/')
          ? effectiveConfig.dirPath.replace('~', os.homedir())
          : effectiveConfig.dirPath;
        MessageFormatter.info(`  Expanded dirPath: ${expandedPath}`, { prefix: "Functions" });
      }
      MessageFormatter.info(`  Appwrite folder: ${(cli as any).controller.getAppwriteFolderPath()}`, { prefix: "Functions" });
      MessageFormatter.info(`  Current working dir: ${process.cwd()}`, { prefix: "Functions" });

      // Resolve config dirPath relative to central YAML if it's relative
      const yamlConfigPath = findYamlConfig((cli as any).currentDir);
      const yamlBaseDir = yamlConfigPath ? require('node:path').dirname(yamlConfigPath) : process.cwd();
      const expandTildePath = (p: string): string => (p?.startsWith('~/') ? p.replace('~', os.homedir()) : p);

      // Check locations in priority order:
      const priorityLocations = [
        // 1. Config dirPath if specified (with tilde expansion)
        effectiveConfig.dirPath
          ? (require('node:path').isAbsolute(expandTildePath(effectiveConfig.dirPath))
              ? expandTildePath(effectiveConfig.dirPath)
              : require('node:path').resolve(yamlBaseDir, expandTildePath(effectiveConfig.dirPath)))
          : undefined,
        // 2. Appwrite config folder/functions/name
        join(
          (cli as any).controller.getAppwriteFolderPath()!,
          "functions",
          functionNameLower
        ),
        // 3. Current working directory/functions/name
        join(process.cwd(), "functions", functionNameLower),
        // 4. Current working directory/name
        join(process.cwd(), functionNameLower),
      ].filter((val): val is string => val !== undefined);

      MessageFormatter.info(`🔍 Priority locations to check:`, { prefix: "Functions" });
      priorityLocations.forEach((loc, i) => {
        MessageFormatter.info(`  ${i + 1}. ${loc}`, { prefix: "Functions" });
      });

      let functionPath: string | null = null;

      // Check each priority location
      for (const location of priorityLocations) {
        MessageFormatter.info(`  Checking: ${location} - ${fs.existsSync(location) ? 'EXISTS' : 'NOT FOUND'}`, { prefix: "Functions" });
        if (fs.existsSync(location)) {
          MessageFormatter.success(`✅ Found function at: ${location}`, { prefix: "Functions" });
          functionPath = location;
          break;
        }
      }

      // If not found in priority locations, do a broader search
      if (!functionPath) {
        MessageFormatter.info(`Function not found in primary locations, searching subdirectories...`, { prefix: "Functions" });

        // Search in both appwrite config directory and current working directory
        functionPath = await (cli as any).findFunctionInSubdirectories(
          [(cli as any).controller.getAppwriteFolderPath()!, process.cwd()],
          functionNameLower
        );
      }

      if (!functionPath) {
        const { shouldDownload } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldDownload",
            message:
              "Function not found locally. Would you like to download the latest deployment?",
            default: false,
          },
        ]);

        if (shouldDownload) {
          try {
            MessageFormatter.progress("Downloading latest deployment...", { prefix: "Functions" });
            const { path: downloadedPath, function: remoteFunction } =
              await downloadLatestFunctionDeployment(
                (cli as any).controller.appwriteServer!,
                effectiveConfig.$id,
                join((cli as any).controller.getAppwriteFolderPath()!, "functions")
              );
            MessageFormatter.success(`✨ Function downloaded to ${downloadedPath}`, { prefix: "Functions" });

            functionPath = downloadedPath;
            effectiveConfig.dirPath = downloadedPath;

            const existingIndex = (cli as any).controller.config.functions.findIndex(
              (f: any) => f?.$id === remoteFunction.$id
            );

            if (existingIndex >= 0) {
              (cli as any).controller.config.functions[existingIndex].dirPath =
                downloadedPath;
            }

            await (cli as any).reloadConfigWithSessionPreservation();
          } catch (error) {
            MessageFormatter.error("Failed to download function deployment", error instanceof Error ? error : new Error(String(error)), { prefix: "Functions" });
            return;
          }
        } else {
          MessageFormatter.error(`Function ${effectiveConfig.name} not found locally. Cannot deploy.`, undefined, { prefix: "Functions" });
          return;
        }
      }

      if (!(cli as any).controller.appwriteServer) {
        MessageFormatter.error("Appwrite server not initialized", undefined, { prefix: "Functions" });
        return;
      }

      batchItems.push({
        functionName: effectiveConfig.name,
        functionConfig: {
          ...effectiveConfig,
          dirPath: functionPath,
        },
        functionPath,
        configDirPath: yamlBaseDir,
      });
    }

    if (!batchItems.length) {
      MessageFormatter.warning("No deployable functions resolved.", { prefix: "Functions" });
      return;
    }

    const results = await deployFunctionsBatch(
      (cli as any).controller.appwriteServer,
      batchItems
    );
    const failed = results.filter((r) => r.status === "failed");
    if (failed.length) {
      MessageFormatter.warning(
        `${failed.length} of ${results.length} functions failed to deploy.`,
        { prefix: "Functions" }
      );
    } else {
      MessageFormatter.success(
        `All ${results.length} selected functions deployed successfully.`,
        { prefix: "Functions" }
      );
    }
  },

  async deleteFunction(cli: InteractiveCLI): Promise<void> {
    const functions = await (cli as any).selectFunctions(
      "Select functions to delete:",
      true,
      false
    );

    if (!functions.length) {
      MessageFormatter.error("No functions selected", undefined, { prefix: "Functions" });
      return;
    }

    for (const func of functions) {
      try {
        await deleteFunction((cli as any).controller!.appwriteServer!, func.$id);
        MessageFormatter.success(`✨ Function ${func.name} deleted successfully!`, { prefix: "Functions" });
      } catch (error) {
        MessageFormatter.error(`Failed to delete function ${func.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Functions" });
      }
    }
  },

  async updateFunctionSpec(cli: InteractiveCLI): Promise<void> {
    const remoteFunctions = await listFunctions(
      (cli as any).controller!.appwriteServer!,
      [Query.limit(1000)]
    );
    const localFunctions = (cli as any).getLocalFunctions();

    const allFunctions = [
      ...remoteFunctions.functions,
      ...localFunctions.filter(
        (f: any) => !remoteFunctions.functions.some((rf: any) => rf.name === f.name)
      ),
    ];

    const functionsToUpdate = await inquirer.prompt([
      {
        type: "checkbox",
        name: "functionId",
        message: "Select functions to update:",
        choices: allFunctions.map((f: any) => ({
          name: `${f.name} (${f.$id})${
            localFunctions.some((lf: any) => lf.name === f.name)
              ? " (Local)"
              : " (Remote)"
          }`,
          value: f.$id,
        })),
        loop: true,
      },
    ]);

    const specifications = await listSpecifications(
      (cli as any).controller!.appwriteServer!
    );
    const { specification } = await inquirer.prompt([
      {
        type: "list",
        name: "specification",
        message: "Select new specification (applies to both build and runtime):",
        choices: specifications.specifications.map((s: any) => ({
          name: `${s.slug}`,
          value: s.slug,
        })),
      },
    ]);

    try {
      for (const functionId of functionsToUpdate.functionId) {
        await (cli as any).controller!.updateFunctionSpecifications(
          functionId,
          specification,
          specification
        );
        MessageFormatter.success(`Successfully updated function build & runtime specification to ${specification}`, { prefix: "Functions" });
      }
    } catch (error) {
      MessageFormatter.error("Error updating function specification", error instanceof Error ? error : new Error(String(error)), { prefix: "Functions" });
    }
  }
};
