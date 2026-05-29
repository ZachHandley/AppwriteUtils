import { toCamelCase, toPascalCase } from "../utils/index.js";
import type {
  AppwriteConfig,
  Attribute,
  RelationshipAttribute,
} from "appwrite-utils";
import { getVersionAwareDirectory, resolveDirectoryForApiMode, getDualDirectoryPaths } from "appwrite-utils/node";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { dump } from "js-yaml";
// import { getDatabaseFromConfig } from "../migrations/afterImportActions.js"; // CLI-only - commented out
import { ulid } from "ulidx";
import { JsonSchemaGenerator } from "./jsonSchemaGenerator.js";
import { collectionToYaml, getCollectionYamlFilename } from "../utils/yamlConverter.js";
import {
  extractTwoWayRelationships,
  resolveCollectionName,
  type RelationshipDetail
} from "./relationshipExtractor.js";
import { resolveSchemaDir } from "../paths/pathResolvers.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

export class SchemaGenerator {
  private relationshipMap = new Map<string, RelationshipDetail[]>();
  private config: AppwriteConfig;
  private appwriteFolderPath: string;

  constructor(config: AppwriteConfig, appwriteFolderPath: string) {
    this.config = config;
    this.appwriteFolderPath = appwriteFolderPath;
    this.extractRelationships();
  }

  private resolveCollectionName = (idOrName: string): string => {
    return resolveCollectionName(this.config, idOrName);
  };

  public updateYamlCollections(): void {
    const collections = this.config.collections;
    delete this.config.collections;

    // Determine output directory based on API mode/version detection
    const outputDir = this.getVersionAwareCollectionsDirectory();
    const collectionsDir = path.join(this.appwriteFolderPath, outputDir);
    if (!fs.existsSync(collectionsDir)) {
      fs.mkdirSync(collectionsDir, { recursive: true });
    }

    collections?.forEach((collection) => {
      // Determine schema path based on config and output directory
      const schemaDir = this.config.schemaConfig?.yamlSchemaDirectory || ".yaml_schemas";
      const isTablesMode = outputDir === "tables";
      const schemaPath = isTablesMode
        ? `../${schemaDir}/table.schema.json`
        : `../${schemaDir}/collection.schema.json`;

      const yamlConfig = {
        useTableTerminology: isTablesMode,
        entityType: isTablesMode ? 'table' as const : 'collection' as const,
        schemaPath
      };

      const yamlContent = collectionToYaml(collection, yamlConfig);
      const filename = getCollectionYamlFilename(collection);
      const filePath = path.join(collectionsDir, filename);

      fs.writeFileSync(filePath, yamlContent, { encoding: "utf-8" });
      MessageFormatter.success(`${outputDir === "tables" ? "Table" : "Collection"} YAML written to ${filePath}`, { prefix: "Schema" });
    });
  }

  public updateTsSchemas(): void {
    const collections = this.config.collections;
    const functions = this.config.functions || [];
    delete this.config.collections;
    delete this.config.functions;

    const configPath = path.join(this.appwriteFolderPath, "appwriteConfig.ts");
    const configContent = `import { type AppwriteConfig } from "appwrite-utils";

  const appwriteConfig: AppwriteConfig = {
    appwriteEndpoint: "${this.config.appwriteEndpoint}",
    appwriteProject: "${this.config.appwriteProject}",
    appwriteKey: "${this.config.appwriteKey}",
    enableBackups: ${this.config.enableBackups},
    backupInterval: ${this.config.backupInterval},
    backupRetention: ${this.config.backupRetention},
    enableBackupCleanup: ${this.config.enableBackupCleanup},
    enableMockData: ${this.config.enableMockData},
    documentBucketId: "${this.config.documentBucketId}",
    usersCollectionName: "${this.config.usersCollectionName}",
    databases: ${JSON.stringify(this.config.databases, null, 4)},
    buckets: ${JSON.stringify(this.config.buckets, null, 4)},
    functions: ${JSON.stringify(
      functions.map((func) => ({
        functionId: func.$id || ulid(),
        name: func.name,
        runtime: func.runtime,
        path: func.dirPath || `functions/${func.name}`,
        entrypoint: func.entrypoint || "src/main.ts",
        execute: func.execute,
        events: func.events || [],
        schedule: func.schedule || "",
        timeout: func.timeout || 15,
        enabled: func.enabled !== false,
        logging: func.logging !== false,
        commands: func.commands || "npm install",
        scopes: func.scopes || [],
        installationId: func.installationId,
        providerRepositoryId: func.providerRepositoryId,
        providerBranch: func.providerBranch,
        providerSilentMode: func.providerSilentMode,
        providerRootDirectory: func.providerRootDirectory,
        buildSpecification: func.buildSpecification,
        runtimeSpecification: func.runtimeSpecification,
        ...(func.predeployCommands
          ? { predeployCommands: func.predeployCommands }
          : {}),
        ...(func.deployDir ? { deployDir: func.deployDir } : {}),
      })),
      null,
      4
    )}
  };

  export default appwriteConfig;
  `;
    fs.writeFileSync(configPath, configContent, { encoding: "utf-8" });

    // Determine output directory based on API mode/version detection
    const outputDir = this.getVersionAwareCollectionsDirectory();
    const collectionsFolderPath = path.join(
      this.appwriteFolderPath,
      outputDir
    );
    if (!fs.existsSync(collectionsFolderPath)) {
      fs.mkdirSync(collectionsFolderPath, { recursive: true });
    }

    collections?.forEach((collection) => {
      const { databaseId, ...collectionWithoutDbId } = collection; // Destructure to exclude databaseId
      const collectionFilePath = path.join(
        collectionsFolderPath,
        `${collection.name}.ts`
      );

      // Determine if we're in tables mode for terminology
      const isTablesMode = outputDir === "tables";
      const securityField = isTablesMode ? "rowSecurity" : "documentSecurity";

      const collectionContent = `import { type CollectionCreate } from "appwrite-utils";

  const ${collection.name}Config: Partial<CollectionCreate> = {
    name: "${collection.name}",
    $id: "${collection.$id}",
    enabled: ${collection.enabled},
    ${securityField}: ${collection.documentSecurity},
    $permissions: [
      ${collection.$permissions
        .map(
          (permission) =>
            `{ permission: "${permission.permission}", target: "${permission.target}" }`
        )
        .join(",\n    ")}
    ],
    attributes: [
      ${collection.attributes
        .map((attr) => {
          return `{ ${Object.entries(attr)
            .map(([key, value]) => {
              // Handle table vs collection terminology for related fields
              let outputKey = key;
              let outputValue = value;

              if (isTablesMode) {
                // Convert collection terminology to table terminology
                if (key === "relatedCollection") {
                  outputKey = "relatedTable";
                }
              }

              // Check the type of the value and format it accordingly
              if (typeof outputValue === "string") {
                // If the value is a string, wrap it in quotes
                return `${outputKey}: "${outputValue.replace(/"/g, '\\"')}`; // Escape existing quotes in the string
              } else if (Array.isArray(outputValue)) {
                // If the value is an array, join it with commas
                if (outputValue.length > 0) {
                  return `${outputKey}: [${outputValue
                    .map((item) => `"${item}"`)
                    .join(", ")}]`;
                } else {
                  return `${outputKey}: []`;
                }
              } else {
                // If the value is not a string (e.g., boolean or number), output it directly
                return `${outputKey}: ${outputValue}`;
              }
            })
            .join(", ")} }`;
        })
        .join(",\n    ")}
    ],
    indexes: [
      ${(
        collection.indexes?.map((index) => {
          // Use appropriate terminology for index attributes/columns
          const indexField = isTablesMode ? "columns" : "attributes";
          const formattedAttributes =
            index.attributes.map((attr) => `"${attr}"`).join(", ") ?? "";
          return `{ key: "${index.key}", type: "${
            index.type
          }", ${indexField}: [${formattedAttributes}], orders: [${
            index.orders
              ?.filter((order) => order !== null)
              .map((order) => `"${order}"`)
              .join(", ") ?? ""
          }] }`;
        }) ?? []
      ).join(",\n    ")}
    ]
  };

  export default ${collection.name}Config;
  `;
      fs.writeFileSync(collectionFilePath, collectionContent, {
        encoding: "utf-8",
      });
      MessageFormatter.success(`${outputDir === "tables" ? "Table" : "Collection"} schema written to ${collectionFilePath}`, { prefix: "Schema" });
    });
  }

  /**
   * Determines the appropriate directory for collections/tables based on API mode
   * Uses version detection or config hints to choose between 'collections' and 'tables'
   */
  private getVersionAwareCollectionsDirectory(): string {
    return getVersionAwareDirectory(this.config, this.appwriteFolderPath);
  }

  /**
   * Get directory for a specific API mode (legacy or tablesdb)
   * @param apiMode - The API mode to get directory for
   * @returns The directory name for the specified API mode
   */
  public getDirectoryForApiMode(apiMode: 'legacy' | 'tablesdb'): string {
    return resolveDirectoryForApiMode(this.config, apiMode, this.appwriteFolderPath);
  }

  /**
   * Get both directory paths for dual API support
   * @returns Object with both collectionsDirectory and tablesDirectory paths
   */
  public getDualDirectoryConfiguration(): { collectionsDirectory: string; tablesDirectory: string } {
    return getDualDirectoryPaths(this.config);
  }

  public async updateConfig(config: AppwriteConfig, isYamlConfig: boolean = false): Promise<void> {
    if (isYamlConfig) {
      // User has YAML config - find the config file and update it + generate individual collection files
      const { findYamlConfig } = await import("../config/yamlConfig.js");
      const yamlConfigPath = findYamlConfig(this.appwriteFolderPath);

      if (yamlConfigPath) {
        await this.updateYamlConfig(config, yamlConfigPath);
      } else {
        MessageFormatter.warning("YAML config expected but not found, falling back to TypeScript", { prefix: "Schema" });
        this.updateTypeScriptConfig(config);
      }
    } else {
      // User has TypeScript config - update the TS file
      this.updateTypeScriptConfig(config);
    }
  }

  private async updateYamlConfig(config: AppwriteConfig, yamlConfigPath: string): Promise<void> {
    try {
      const { writeYamlConfig } = await import("../config/yamlConfig.js");

      // Write the main YAML config (without collections)
      await writeYamlConfig(yamlConfigPath, config);

      // Generate individual collection YAML files
      this.updateYamlCollections();

      MessageFormatter.success("Updated YAML configuration and collection files", { prefix: "Schema" });
    } catch (error) {
      MessageFormatter.error("Error updating YAML config", error as Error, { prefix: "Schema" });
      throw error;
    }
  }

  private updateTypeScriptConfig(config: AppwriteConfig): void {
    const configPath = path.join(this.appwriteFolderPath, "appwriteConfig.ts");
    const configContent = `import { type AppwriteConfig } from "appwrite-utils";

const appwriteConfig: AppwriteConfig = {
  appwriteEndpoint: "${config.appwriteEndpoint}",
  appwriteProject: "${config.appwriteProject}",
  appwriteKey: "${config.appwriteKey}",
  enableBackups: ${config.enableBackups},
  backupInterval: ${config.backupInterval},
  backupRetention: ${config.backupRetention},
  enableBackupCleanup: ${config.enableBackupCleanup},
  enableMockData: ${config.enableMockData},
  documentBucketId: "${config.documentBucketId}",
  usersCollectionName: "${config.usersCollectionName}",
  databases: ${JSON.stringify(config.databases, null, 4)},
  buckets: ${JSON.stringify(config.buckets, null, 4)},
  functions: ${JSON.stringify(
    config.functions?.map((func) => ({
      $id: func.$id || ulid(),
      name: func.name,
      runtime: func.runtime,
      dirPath: func.dirPath || "functions/" + func.name,
      entrypoint: func.entrypoint || "src/main.ts",
      execute: func.execute || [],
      events: func.events || [],
      schedule: func.schedule || "",
      timeout: func.timeout || 15,
      enabled: func.enabled !== false,
      logging: func.logging !== false,
      commands: func.commands || "npm install",
      scopes: func.scopes || [],
      installationId: func.installationId,
      providerRepositoryId: func.providerRepositoryId,
      providerBranch: func.providerBranch,
      providerSilentMode: func.providerSilentMode,
      providerRootDirectory: func.providerRootDirectory,
      buildSpecification: func.buildSpecification,
      runtimeSpecification: func.runtimeSpecification,
    })),
    null,
    4
  )},
  collections: ${JSON.stringify(config.collections, null, 4)}
};

export default appwriteConfig;
`;
    fs.writeFileSync(configPath, configContent, { encoding: "utf-8" });
    MessageFormatter.success("Updated TypeScript configuration file", { prefix: "Schema" });
  }

  private extractRelationships(): void {
    this.relationshipMap = extractTwoWayRelationships(this.config);
  }

  private static parseFormats(
    format: string | undefined
  ): Set<"zod" | "json" | "pydantic" | "go" | "dart" | "rust"> {
    const result = new Set<"zod" | "json" | "pydantic" | "go" | "dart" | "rust">();
    const raw = (format ?? "").trim();
    if (!raw) {
      result.add("zod");
      result.add("json");
      return result;
    }
    for (const part of raw.split(",")) {
      const tok = part.trim().toLowerCase();
      if (!tok) continue;
      switch (tok) {
        case "ts":
        case "zod":
          result.add("zod");
          break;
        case "json":
          result.add("json");
          break;
        case "py":
        case "pydantic":
          result.add("pydantic");
          break;
        case "go":
        case "golang":
          result.add("go");
          break;
        case "dart":
          result.add("dart");
          break;
        case "rust":
        case "rs":
          result.add("rust");
          break;
        case "both":
          result.add("zod");
          result.add("json");
          break;
        case "all":
          result.add("zod");
          result.add("json");
          result.add("pydantic");
          result.add("go");
          result.add("dart");
          result.add("rust");
          break;
        default:
          throw new Error(
            `Unknown schemaFormat token: ${tok}. Expected: ts, zod, json, py, pydantic, go, dart, rust, both, all`
          );
      }
    }
    return result;
  }

  public async generateSchemas(options: {
    format?: string;
    verbose?: boolean;
    outputDir?: string;
  } = {}): Promise<void> {
    const { format, verbose = false, outputDir } = options;
    const formats = SchemaGenerator.parseFormats(format);

    if (!this.config.collections) {
      return;
    }

    // Create schemas directory using config setting
    const configuredDir = outputDir || this.config.schemaConfig?.outputDirectory || "schemas";
    let schemasPath: string;
    if (path.isAbsolute(configuredDir)) {
      schemasPath = configuredDir;
    } else if (outputDir) {
      // Caller passed an explicit relative override → resolve from the invocation CWD,
      // not the config folder. Matches the natural shell expectation for `--schemaOutDir`.
      schemasPath = path.resolve(process.cwd(), configuredDir);
    } else if (configuredDir === "schemas") {
      schemasPath = resolveSchemaDir(this.appwriteFolderPath);
    } else {
      schemasPath = path.join(this.appwriteFolderPath, configuredDir);
    }
    if (!fs.existsSync(schemasPath)) {
      fs.mkdirSync(schemasPath, { recursive: true });
    }

    // Generate Zod schemas (TypeScript)
    if (formats.has("zod")) {
      this.config.collections.forEach((collection) => {
        const schemaString = this.createSchemaStringV4(
          collection.name,
          collection.attributes || []
        );
        const camelCaseName = toCamelCase(collection.name);
        const schemaPath = path.join(schemasPath, `${camelCaseName}.ts`);
        fs.writeFileSync(schemaPath, schemaString, { encoding: "utf-8" });
        if (verbose) {
          MessageFormatter.success(`Zod schema written to ${schemaPath}`, { prefix: "Schema" });
        }
      });
    }

    // Generate JSON schemas (all at once). Pass the already-resolved absolute schemasPath
    // so JsonSchemaGenerator lands files in the same dir as zod/pydantic instead of
    // re-resolving relative paths against appwriteFolderPath.
    if (formats.has("json")) {
      const jsonSchemaGenerator = new JsonSchemaGenerator(this.config, this.appwriteFolderPath);
      jsonSchemaGenerator.generateJsonSchemas({
        outputFormat: formats.has("zod") ? "both" : "json",
        outputDirectory: schemasPath,
        verbose: verbose
      });
    }

    // Generate Python Pydantic models
    if (formats.has("pydantic")) {
      const mod = await import("./pydanticModelGenerator.js");
      const pgen = new mod.PydanticModelGenerator(this.config, this.appwriteFolderPath);
      pgen.generatePydanticModels({ baseOutputDirectory: schemasPath, verbose });
    }

    // Generate Go structs (serde-style json tags)
    if (formats.has("go")) {
      const mod = await import("./goModelGenerator.js");
      const ggen = new mod.GoModelGenerator(this.config, this.appwriteFolderPath);
      ggen.generate({ baseOutputDirectory: schemasPath, verbose });
    }

    // Generate Dart classes (with fromJson factories)
    if (formats.has("dart")) {
      const mod = await import("./dartModelGenerator.js");
      const dgen = new mod.DartModelGenerator(this.config, this.appwriteFolderPath);
      dgen.generate({ baseOutputDirectory: schemasPath, verbose });
    }

    // Generate Rust structs (serde derive)
    if (formats.has("rust")) {
      const mod = await import("./rustModelGenerator.js");
      const rgen = new mod.RustModelGenerator(this.config, this.appwriteFolderPath);
      rgen.generate({ baseOutputDirectory: schemasPath, verbose });
    }

    if (verbose) {
      const summary = Array.from(formats).join(",");
      MessageFormatter.success(`Schema generation completed (format: ${summary})`, { prefix: "Schema" });
    }
  }

  // Zod v4 recursive getter-based schemas
  createSchemaStringV4 = (name: string, attributes: Attribute[]): string => {
    const pascalName = toPascalCase(name);
    let imports = `import { z } from "zod";\n`;

    // Use the relationshipMap to find related collections
    const relationshipDetails = this.relationshipMap.get(name) || [];
    let relatedCollections = relationshipDetails
      .filter((detail, index, self) => {
        const uniqueKey = `${detail.parentCollection}-${detail.childCollection}-${detail.parentKey}-${detail.childKey}`;
        return (
          index ===
          self.findIndex(
            (obj) =>
              `${obj.parentCollection}-${obj.childCollection}-${obj.parentKey}-${obj.childKey}` ===
              uniqueKey
          )
        );
      })
      .map((detail) => {
        const relatedCollectionName = detail.isChild
          ? detail.parentCollection
          : detail.childCollection;
        const key = detail.isChild ? detail.childKey : detail.parentKey;
        const isArray = detail.isArray ? "array" : "";
        return [relatedCollectionName, key, isArray];
      });

    // Include one-way relationship attributes directly (no twoWayKey)
    const oneWayRels: Array<[string, string, string]> = [];
    for (const attr of attributes) {
      if (attr.type === "relationship" && attr.relatedCollection) {
        const relatedName = this.resolveCollectionName(attr.relatedCollection);
        const isArray =
          attr.relationType === "oneToMany" || attr.relationType === "manyToMany"
            ? "array"
            : "";
        oneWayRels.push([relatedName, attr.key, isArray]);
      }
    }

    // Merge and dedupe (by relatedName+key)
    relatedCollections = [...relatedCollections, ...oneWayRels].filter(
      (item, idx, self) =>
        idx === self.findIndex((o) => `${o[0]}::${o[1]}` === `${item[0]}::${item[1]}`)
    );

    const hasRelationships = relatedCollections.length > 0;

    // Build imports for related collections
    if (hasRelationships) {
      const importLines = relatedCollections.map((rel) => {
        const relatedPascalName = toPascalCase(rel[0]);
        const relatedCamelName = toCamelCase(rel[0]);
        return `import { ${relatedPascalName}Schema } from "./${relatedCamelName}";`;
      });
      const unique = Array.from(new Set(importLines));
      imports += unique.join("\n") + (unique.length ? "\n" : "");
    }

    let schemaString = `${imports}\n`;

    // Determine if we're in tables mode for the entity ID field
    const isTablesMode = this.getVersionAwareCollectionsDirectory() === 'tables';
    const entityIdField = isTablesMode ? '$tableId' : '$collectionId';

    // Single object schema with recursive getters (Zod v4)
    schemaString += `export const ${pascalName}Schema = z.object({\n`;
    schemaString += `  $id: z.string(),\n`;
    schemaString += `  $createdAt: z.string(),\n`;
    schemaString += `  $updatedAt: z.string(),\n`;
    schemaString += `  $permissions: z.array(z.string()),\n`;
    schemaString += `  $databaseId: z.string(),\n`;
    schemaString += `  ${entityIdField}: z.string(),\n`;
    schemaString += `  $sequence: z.string(),\n`;
    for (const attribute of attributes) {
      if (attribute.type === "relationship") continue;
      schemaString += `  ${attribute.key}: ${this.typeToZod(attribute)},\n`;
    }

    // Add recursive getters for relationships (respect required flag)
    relatedCollections.forEach((rel) => {
      const relatedPascalName = toPascalCase(rel[0]);
      const isArray = rel[2] === "array";
      const key = String(rel[1]);
      const attrMeta = attributes.find(a => a.key === key && a.type === "relationship");
      const isRequired = !!attrMeta?.required;
      const schemaRef = `typeof ${relatedPascalName}Schema`;
      const arrayType = `z.ZodArray<${schemaRef}>`;
      const nullableWrapper = isArray ? `z.ZodNullable<${arrayType}>` : `z.ZodNullable<${schemaRef}>`;
      const getterReturnType = isRequired
        ? (isArray ? arrayType : schemaRef)
        : `z.ZodOptional<${nullableWrapper}>`;
      let getterBody = "";
      if (isArray) {
        getterBody = isRequired
          ? `z.array(${relatedPascalName}Schema)`
          : `z.nullish(z.array(${relatedPascalName}Schema))`;
      } else {
        getterBody = isRequired
          ? `${relatedPascalName}Schema`
          : `z.nullish(${relatedPascalName}Schema)`;
      }
      schemaString += `  get ${key}(): ${getterReturnType} {\n    return ${getterBody}\n  },\n`;
    });

    schemaString += `});\n\n`;
    schemaString += `export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;\n\n`;

    return schemaString;
  };

  typeToZod = (attribute: Attribute) => {
    let baseSchemaCode = "";
    const finalAttribute: Attribute = (
      attribute.type === "string" &&
      attribute.format &&
      attribute.format === "enum" &&
      attribute.type === "string"
        ? { ...attribute, type: attribute.format }
        : attribute
    ) as Attribute;
    switch (finalAttribute.type) {
      case "string":
        baseSchemaCode = "z.string()";
        if (finalAttribute.size) {
          baseSchemaCode += `.max(${finalAttribute.size}, "Maximum length of ${finalAttribute.size} characters exceeded")`;
        }
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default("${finalAttribute.xdefault}")`;
        }
        if (!attribute.required && !attribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "integer":
        baseSchemaCode = "z.number().int()";
        if (finalAttribute.min !== undefined) {
          if (BigInt(finalAttribute.min) === BigInt(-9223372036854776000)) {
            finalAttribute.min = undefined;
          } else {
            baseSchemaCode += `.min(${finalAttribute.min}, "Minimum value of ${finalAttribute.min} not met")`;
          }
        }
        if (finalAttribute.max !== undefined) {
          if (BigInt(finalAttribute.max) === BigInt(9223372036854776000)) {
            finalAttribute.max = undefined;
          } else {
            baseSchemaCode += `.max(${finalAttribute.max}, "Maximum value of ${finalAttribute.max} exceeded")`;
          }
        }
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default(${finalAttribute.xdefault})`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "double":
      case "float": // Backward compatibility
        baseSchemaCode = "z.number()";
        if (finalAttribute.min !== undefined) {
          baseSchemaCode += `.min(${finalAttribute.min}, "Minimum value of ${finalAttribute.min} not met")`;
        }
        if (finalAttribute.max !== undefined) {
          baseSchemaCode += `.max(${finalAttribute.max}, "Maximum value of ${finalAttribute.max} exceeded")`;
        }
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default(${finalAttribute.xdefault})`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "boolean":
        baseSchemaCode = "z.boolean()";
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default(${finalAttribute.xdefault})`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "datetime":
        baseSchemaCode = "z.date()";
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default(new Date("${finalAttribute.xdefault}"))`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "email":
        baseSchemaCode = "z.string().email()";
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default("${finalAttribute.xdefault}")`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "ip":
        baseSchemaCode = "z.string()"; // Add custom validation as needed
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default("${finalAttribute.xdefault}")`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "url":
        baseSchemaCode = "z.string().url()";
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default("${finalAttribute.xdefault}")`;
        }
        if (!finalAttribute.required && !finalAttribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "enum":
        baseSchemaCode = `z.enum([${finalAttribute.elements
          .map((element) => `"${element}"`)
          .join(", ")}])`;
        if (finalAttribute.xdefault !== undefined) {
          baseSchemaCode += `.default("${finalAttribute.xdefault}")`;
        }
        if (!attribute.required && !attribute.array) {
          baseSchemaCode += ".nullish()";
        }
        break;
      case "relationship":
        break;
      default:
        baseSchemaCode = "z.any()";
    }

    // Handle arrays
    if (attribute.array) {
      baseSchemaCode = `z.array(${baseSchemaCode})`;
    }
    if (attribute.array && !attribute.required) {
      baseSchemaCode += ".nullish()";
    }

    return baseSchemaCode;
  };
}
