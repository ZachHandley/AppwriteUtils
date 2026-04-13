import inquirer from "inquirer";
import { ulid } from "ulidx";
import { Query } from "node-appwrite";
import { MessageFormatter } from "appwrite-utils-helpers";
import { findYamlConfig } from "appwrite-utils-helpers";
import {
  FrameworkSchema,
  AdapterSchema,
  BuildRuntimeSchema,
  type AppwriteSite,
} from "appwrite-utils";
import {
  listSites,
  deleteSite,
  listSiteSpecifications,
} from "../../sites/methods.js";
import { deployLocalSite } from "../../sites/deployments.js";
import {
  discoverSiteConfigs,
  mergeDiscoveredSites,
} from "../../sites/siteConfigDiscovery.js";
import type { InteractiveCLI } from "../../interactiveCLI.js";
import { join } from "node:path";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const siteCommands = {
  async createSite(cli: InteractiveCLI): Promise<void> {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Site name:",
        validate: (input) => input.length > 0 || "Site name is required",
      },
    ]);

    const { framework } = await inquirer.prompt([
      {
        type: "list",
        name: "framework",
        message: "Select framework:",
        choices: FrameworkSchema.options,
      },
    ]);

    const { adapter } = await inquirer.prompt([
      {
        type: "list",
        name: "adapter",
        message: "Select adapter:",
        choices: AdapterSchema.options,
        default: "static",
      },
    ]);

    // Offer common build runtimes at the top, with option to see all
    const commonRuntimes = [
      "node-22",
      "node-24",
      "static-1",
      "bun-1.2",
      "flutter-3.32",
    ];
    const allRuntimes: string[] = BuildRuntimeSchema.options;
    const { buildRuntime } = await inquirer.prompt([
      {
        type: "list",
        name: "buildRuntime",
        message: "Select build runtime:",
        choices: [
          new inquirer.Separator("--- Common ---"),
          ...commonRuntimes.filter((r) => allRuntimes.includes(r)),
          new inquirer.Separator("--- All ---"),
          ...allRuntimes.filter((r) => !commonRuntimes.includes(r)),
        ],
        default: "node-22",
      },
    ]);

    // Try to fetch specifications from the server
    let specChoices: { name: string; value: string | undefined }[] = [
      { name: "Default (s-0.5vcpu-512mb)", value: undefined },
    ];
    try {
      const specs = await listSiteSpecifications(
        (cli as any).controller!.appwriteServer!
      );
      if (specs.specifications?.length) {
        specChoices = [
          { name: "Default (s-0.5vcpu-512mb)", value: undefined },
          ...specs.specifications.map((s: any) => ({
            name: s.slug,
            value: s.slug,
          })),
        ];
      }
    } catch {
      // If we can't fetch specs, use defaults
    }

    const { buildSpecification } = await inquirer.prompt([
      {
        type: "list",
        name: "buildSpecification",
        message: "Select build specification:",
        choices: specChoices,
      },
    ]);

    const { installCommand } = await inquirer.prompt([
      {
        type: "input",
        name: "installCommand",
        message: "Install command (leave blank for default):",
        default: "",
      },
    ]);

    const { buildCommand } = await inquirer.prompt([
      {
        type: "input",
        name: "buildCommand",
        message: "Build command (leave blank for default):",
        default: "",
      },
    ]);

    const { outputDirectory } = await inquirer.prompt([
      {
        type: "input",
        name: "outputDirectory",
        message: "Output directory (leave blank for default):",
        default: "",
      },
    ]);

    const siteConfig: AppwriteSite = {
      $id: ulid(),
      name,
      framework,
      buildRuntime,
      adapter,
      enabled: true,
      logging: true,
      timeout: 15,
      ...(installCommand && { installCommand }),
      ...(buildCommand && { buildCommand }),
      ...(outputDirectory && { outputDirectory }),
      ...(buildSpecification && {
        buildSpecification,
        runtimeSpecification: buildSpecification,
      }),
    };

    // Add to in-memory config
    if (!(cli as any).controller!.config!.sites) {
      (cli as any).controller!.config!.sites = [];
    }
    (cli as any).controller!.config!.sites.push(siteConfig);

    // If using YAML config, also add to YAML file
    const yamlConfigPath = findYamlConfig((cli as any).currentDir);
    if (yamlConfigPath) {
      try {
        // Read current YAML, add site, and write back
        const yamlModule = await import("js-yaml");
        const fileContent = fs.readFileSync(yamlConfigPath, "utf8");
        const yamlData = yamlModule.load(fileContent) as any;

        if (!yamlData.sites) {
          yamlData.sites = [];
        }

        yamlData.sites.push({
          id: siteConfig.$id,
          name: siteConfig.name,
          framework: siteConfig.framework,
          buildRuntime: siteConfig.buildRuntime,
          adapter: siteConfig.adapter,
          enabled: siteConfig.enabled !== false,
          logging: siteConfig.logging !== false,
          timeout: siteConfig.timeout || 15,
          ...(siteConfig.installCommand && {
            installCommand: siteConfig.installCommand,
          }),
          ...(siteConfig.buildCommand && {
            buildCommand: siteConfig.buildCommand,
          }),
          ...(siteConfig.outputDirectory && {
            outputDirectory: siteConfig.outputDirectory,
          }),
          ...(siteConfig.buildSpecification && {
            buildSpecification: siteConfig.buildSpecification,
          }),
          ...(siteConfig.runtimeSpecification && {
            runtimeSpecification: siteConfig.runtimeSpecification,
          }),
        });

        const yamlContent = yamlModule.dump(yamlData, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
        });

        // Preserve schema comment lines at the top
        const lines = fileContent.split("\n");
        const schemaLine = lines.find((line: string) =>
          line.startsWith("# yaml-language-server:")
        );
        const commentLine = lines.find((line: string) =>
          line.startsWith("# Appwrite Project Configuration")
        );

        let finalContent = yamlContent;
        if (schemaLine) {
          finalContent = schemaLine + "\n";
          if (commentLine) {
            finalContent += commentLine + "\n";
          }
          finalContent += yamlContent;
        }

        fs.writeFileSync(yamlConfigPath, finalContent, "utf8");
        MessageFormatter.success("Site added to YAML config", {
          prefix: "Sites",
        });
      } catch (error) {
        MessageFormatter.warning(
          `Site created but failed to update YAML config: ${error instanceof Error ? error.message : error}`,
          { prefix: "Sites" }
        );
      }
    }

    MessageFormatter.success("Site created successfully!", {
      prefix: "Sites",
    });
  },

  async deploySite(cli: InteractiveCLI): Promise<void> {
    await (cli as any).initControllerIfNeeded();
    if (!(cli as any).controller?.config) {
      MessageFormatter.error(
        "Failed to initialize controller or load config",
        undefined,
        { prefix: "Sites" }
      );
      return;
    }

    // Discover per-site .siteconfig.yaml definitions and merge with central list
    let discovered: AppwriteSite[] = [];
    let central: AppwriteSite[] =
      (cli as any).controller!.config!.sites || [];
    try {
      discovered = discoverSiteConfigs((cli as any).currentDir);
      const merged = mergeDiscoveredSites(central, discovered);
      (cli as any).controller!.config!.sites = merged;
    } catch {}

    const allSites: AppwriteSite[] =
      (cli as any).controller!.config!.sites || [];

    if (!allSites.length) {
      MessageFormatter.error(
        "No sites found in config or via .siteconfig.yaml discovery",
        undefined,
        { prefix: "Sites" }
      );
      return;
    }

    const { selectedSites } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedSites",
        message: "Select site(s) to deploy:",
        choices: allSites.map((s) => ({
          name: `${s.name} (${s.$id}) [${s.framework}]`,
          value: s,
        })),
        validate: (input) =>
          input.length > 0 || "Please select at least one site",
      },
    ]);

    if (!selectedSites?.length) {
      MessageFormatter.error("No site selected", undefined, {
        prefix: "Sites",
      });
      return;
    }

    const yamlConfigPath = findYamlConfig((cli as any).currentDir);
    const yamlBaseDir = yamlConfigPath
      ? path.dirname(yamlConfigPath)
      : process.cwd();

    for (const siteConfig of selectedSites as AppwriteSite[]) {
      // Resolve effective config (prefer per-site if both sources exist)
      const byIdOrName = (arr: AppwriteSite[]) =>
        arr.find(
          (s) => s.$id === siteConfig.$id || s.name === siteConfig.name
        );
      const centralDef = byIdOrName(central);
      const discoveredDef = byIdOrName(discovered);

      let effectiveConfig = siteConfig;
      if (centralDef && discoveredDef) {
        try {
          const answer = await inquirer.prompt([
            {
              type: "list",
              name: "cfgChoice",
              message: `Multiple configs found for '${siteConfig.name}'. Which to use?`,
              choices: [
                {
                  name: "config.yaml (central)",
                  value: "central",
                },
                {
                  name: ".siteconfig.yaml (local file)",
                  value: "siteconfig",
                },
                {
                  name: "Merge (.siteconfig overrides central)",
                  value: "merge",
                },
              ],
              default: "siteconfig",
            },
          ]);
          if (answer.cfgChoice === "central") effectiveConfig = centralDef;
          else if (answer.cfgChoice === "siteconfig")
            effectiveConfig = discoveredDef;
          else effectiveConfig = { ...centralDef, ...discoveredDef };
        } catch {}
      }

      const siteNameLower = effectiveConfig.name
        .toLowerCase()
        .replace(/\s+/g, "-");

      const expandTildePath = (p: string): string =>
        p?.startsWith("~/") ? p.replace("~", os.homedir()) : p;

      // Check locations in priority order
      const priorityLocations = [
        // 1. Config dirPath if specified
        effectiveConfig.dirPath
          ? path.isAbsolute(expandTildePath(effectiveConfig.dirPath))
            ? expandTildePath(effectiveConfig.dirPath)
            : path.resolve(
                yamlBaseDir,
                expandTildePath(effectiveConfig.dirPath)
              )
          : undefined,
        // 2. Appwrite config folder/sites/name
        (cli as any).controller.getAppwriteFolderPath()
          ? join(
              (cli as any).controller.getAppwriteFolderPath()!,
              "sites",
              siteNameLower
            )
          : undefined,
        // 3. Current working directory/sites/name
        join(process.cwd(), "sites", siteNameLower),
        // 4. Current working directory/name
        join(process.cwd(), siteNameLower),
      ].filter((val): val is string => val !== undefined);

      let sitePath: string | null = null;

      for (const location of priorityLocations) {
        if (fs.existsSync(location)) {
          MessageFormatter.success(`Found site at: ${location}`, {
            prefix: "Sites",
          });
          sitePath = location;
          break;
        }
      }

      if (!sitePath) {
        MessageFormatter.error(
          `Site directory for ${effectiveConfig.name} not found. Checked:\n${priorityLocations.map((l) => `  - ${l}`).join("\n")}`,
          undefined,
          { prefix: "Sites" }
        );
        continue;
      }

      if (!(cli as any).controller.appwriteServer) {
        MessageFormatter.error("Appwrite server not initialized", undefined, {
          prefix: "Sites",
        });
        return;
      }

      try {
        await deployLocalSite(
          (cli as any).controller.appwriteServer,
          effectiveConfig.name,
          {
            ...effectiveConfig,
            dirPath: sitePath,
          },
          sitePath,
          yamlBaseDir
        );
        MessageFormatter.success("Site deployed successfully!", {
          prefix: "Sites",
        });
      } catch (error) {
        MessageFormatter.error(
          "Failed to deploy site",
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Sites" }
        );
      }
    }
  },

  async deleteSite(cli: InteractiveCLI): Promise<void> {
    await (cli as any).initControllerIfNeeded();
    if (!(cli as any).controller?.appwriteServer) {
      MessageFormatter.error(
        "Failed to initialize controller",
        undefined,
        { prefix: "Sites" }
      );
      return;
    }

    let remoteSites: any[] = [];
    try {
      const result = await listSites(
        (cli as any).controller.appwriteServer,
        [Query.limit(500)]
      );
      remoteSites = result.sites || [];
    } catch (error) {
      MessageFormatter.error(
        "Failed to list remote sites",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Sites" }
      );
      return;
    }

    if (!remoteSites.length) {
      MessageFormatter.info("No remote sites found", { prefix: "Sites" });
      return;
    }

    const { selectedSiteIds } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedSiteIds",
        message: "Select site(s) to delete:",
        choices: remoteSites.map((s: any) => ({
          name: `${s.name} (${s.$id}) [${s.framework}]`,
          value: s.$id,
        })),
        validate: (input) =>
          input.length > 0 || "Please select at least one site",
      },
    ]);

    if (!selectedSiteIds?.length) {
      MessageFormatter.error("No sites selected", undefined, {
        prefix: "Sites",
      });
      return;
    }

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to delete ${selectedSiteIds.length} site(s)? This cannot be undone.`,
        default: false,
      },
    ]);

    if (!confirm) {
      MessageFormatter.info("Deletion cancelled", { prefix: "Sites" });
      return;
    }

    for (const siteId of selectedSiteIds) {
      const siteName =
        remoteSites.find((s: any) => s.$id === siteId)?.name || siteId;
      try {
        await deleteSite(
          (cli as any).controller.appwriteServer,
          siteId
        );
        MessageFormatter.success(`Site ${siteName} deleted successfully!`, {
          prefix: "Sites",
        });
      } catch (error) {
        MessageFormatter.error(
          `Failed to delete site ${siteName}`,
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Sites" }
        );
      }
    }
  },
};
