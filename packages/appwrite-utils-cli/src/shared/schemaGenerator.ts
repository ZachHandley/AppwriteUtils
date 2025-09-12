import { toCamelCase, toPascalCase } from "../utils/index.js";
import type {
  AppwriteConfig,
  Attribute,
  RelationshipAttribute,
} from "appwrite-utils";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { dump } from "js-yaml";
import { getDatabaseFromConfig } from "../migrations/afterImportActions.js";
import { ulid } from "ulidx";
import { JsonSchemaGenerator } from "./jsonSchemaGenerator.js";
import { collectionToYaml, getCollectionYamlFilename } from "../utils/yamlConverter.js";

interface RelationshipDetail {
  parentCollection: string;
  childCollection: string;
  parentKey: string;
  childKey: string;
  isArray: boolean;
  isChild: boolean;
}

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
    const col = this.config.collections?.find(
      (c) => c.$id === (idOrName as any) || c.name === idOrName
    );
    return col?.name ?? idOrName;
  };

  public updateYamlCollections(): void {
    const collections = this.config.collections;
    delete this.config.collections;

    const collectionsDir = path.join(this.appwriteFolderPath, "collections");
    if (!fs.existsSync(collectionsDir)) {
      fs.mkdirSync(collectionsDir, { recursive: true });
    }

    collections?.forEach((collection) => {
      // Determine schema path based on config
      const schemaDir = this.config.schemaConfig?.yamlSchemaDirectory || ".yaml_schemas";
      const schemaPath = `../${schemaDir}/collection.schema.json`;
      
      const yamlContent = collectionToYaml(collection, schemaPath);
      const filename = getCollectionYamlFilename(collection);
      const filePath = path.join(collectionsDir, filename);
      
      fs.writeFileSync(filePath, yamlContent, { encoding: "utf-8" });
      console.log(`Collection YAML written to ${filePath}`);
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
        entrypoint: func.entrypoint || "src/index.ts",
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
        specification: func.specification,
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

    const collectionsFolderPath = path.join(
      this.appwriteFolderPath,
      "collections"
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
      const collectionContent = `import { type CollectionCreate } from "appwrite-utils";
  
  const ${collection.name}Config: Partial<CollectionCreate> = {
    name: "${collection.name}",
    $id: "${collection.$id}",
    enabled: ${collection.enabled},
    documentSecurity: ${collection.documentSecurity},
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
              // Check the type of the value and format it accordingly
              if (typeof value === "string") {
                // If the value is a string, wrap it in quotes
                return `${key}: "${value.replace(/"/g, '\\"')}"`; // Escape existing quotes in the string
              } else if (Array.isArray(value)) {
                // If the value is an array, join it with commas
                if (value.length > 0) {
                  return `${key}: [${value
                    .map((item) => `"${item}"`)
                    .join(", ")}]`;
                } else {
                  return `${key}: []`;
                }
              } else {
                // If the value is not a string (e.g., boolean or number), output it directly
                return `${key}: ${value}`;
              }
            })
            .join(", ")} }`;
        })
        .join(",\n    ")}
    ],
    indexes: [
      ${(
        collection.indexes?.map((index) => {
          // Map each attribute to ensure it is properly quoted
          const formattedAttributes =
            index.attributes.map((attr) => `"${attr}"`).join(", ") ?? "";
          return `{ key: "${index.key}", type: "${
            index.type
          }", attributes: [${formattedAttributes}], orders: [${
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
      console.log(`Collection schema written to ${collectionFilePath}`);
    });
  }

  public async updateConfig(config: AppwriteConfig, isYamlConfig: boolean = false): Promise<void> {
    if (isYamlConfig) {
      // User has YAML config - find the config file and update it + generate individual collection files
      const { findYamlConfig } = await import("../config/yamlConfig.js");
      const yamlConfigPath = findYamlConfig(this.appwriteFolderPath);
      
      if (yamlConfigPath) {
        await this.updateYamlConfig(config, yamlConfigPath);
      } else {
        console.warn("⚠️ YAML config expected but not found, falling back to TypeScript");
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
      
      console.log("✅ Updated YAML configuration and collection files");
    } catch (error) {
      console.error("❌ Error updating YAML config:", error instanceof Error ? error.message : error);
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
      entrypoint: func.entrypoint || "src/index.ts",
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
      specification: func.specification,
    })),
    null,
    4
  )},
  collections: ${JSON.stringify(config.collections, null, 4)}
};

export default appwriteConfig;
`;
    fs.writeFileSync(configPath, configContent, { encoding: "utf-8" });
    console.log("✅ Updated TypeScript configuration file");
  }

  private extractRelationships(): void {
    if (!this.config.collections) {
      return;
    }
    this.config.collections.forEach((collection) => {
      if (!collection.attributes) {
        return;
      }
      collection.attributes.forEach((attr) => {
        if (attr.type === "relationship" && attr.twoWay && attr.twoWayKey) {
          const relationshipAttr = attr as RelationshipAttribute;
          let isArrayParent = false;
          let isArrayChild = false;
          switch (relationshipAttr.relationType) {
            case "oneToMany":
              isArrayParent = true;
              isArrayChild = false;
              break;
            case "manyToMany":
              isArrayParent = true;
              isArrayChild = true;
              break;
            case "oneToOne":
              isArrayParent = false;
              isArrayChild = false;
              break;
            case "manyToOne":
              isArrayParent = false;
              isArrayChild = true;
              break;
            default:
              break;
          }
          this.addRelationship(
            collection.name,
            this.resolveCollectionName(relationshipAttr.relatedCollection),
            attr.key,
            relationshipAttr.twoWayKey!,
            isArrayParent,
            isArrayChild
          );
          console.log(
            `Extracted relationship: ${attr.key}\n\t${collection.name} -> ${relationshipAttr.relatedCollection}, databaseId: ${collection.databaseId}`
          );
        }
      });
    });
  }

  private addRelationship(
    parentCollection: string,
    childCollection: string,
    parentKey: string,
    childKey: string,
    isArrayParent: boolean,
    isArrayChild: boolean
  ): void {
    const relationshipsChild = this.relationshipMap.get(childCollection) || [];
    const relationshipsParent =
      this.relationshipMap.get(parentCollection) || [];
    relationshipsParent.push({
      parentCollection,
      childCollection,
      parentKey,
      childKey,
      isArray: isArrayParent,
      isChild: false,
    });
    relationshipsChild.push({
      parentCollection,
      childCollection,
      parentKey,
      childKey,
      isArray: isArrayChild,
      isChild: true,
    });
    this.relationshipMap.set(childCollection, relationshipsChild);
    this.relationshipMap.set(parentCollection, relationshipsParent);
  }

  public generateSchemas(options: {
    format?: "zod" | "json" | "both";
    verbose?: boolean;
  } = {}): void {
    const { format = "both", verbose = false } = options;
    
    if (!this.config.collections) {
      return;
    }
    
    // Create schemas directory using config setting
    const outputDir = this.config.schemaConfig?.outputDirectory || "schemas";
    const schemasPath = path.join(this.appwriteFolderPath, outputDir);
    if (!fs.existsSync(schemasPath)) {
      fs.mkdirSync(schemasPath, { recursive: true });
    }
    
    // Generate Zod schemas (TypeScript)
    if (format === "zod" || format === "both") {
      this.config.collections.forEach((collection) => {
        const schemaString = this.createSchemaStringV4(
          collection.name,
          collection.attributes || []
        );
        const camelCaseName = toCamelCase(collection.name);
        const schemaPath = path.join(schemasPath, `${camelCaseName}.ts`);
        fs.writeFileSync(schemaPath, schemaString, { encoding: "utf-8" });
        if (verbose) {
          console.log(`Zod schema written to ${schemaPath}`);
        }
      });
    }
    
    // Generate JSON schemas (all at once)
    if (format === "json" || format === "both") {
      const jsonSchemaGenerator = new JsonSchemaGenerator(this.config, this.appwriteFolderPath);
      jsonSchemaGenerator.generateJsonSchemas({
        outputFormat: format === "json" ? "json" : "both",
        outputDirectory: outputDir,
        verbose: verbose
      });
    }
    
    if (verbose) {
      console.log(`✓ Schema generation completed (format: ${format})`);
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

    // Single object schema with recursive getters (Zod v4)
    schemaString += `export const ${pascalName}Schema = z.object({\n`;
    schemaString += `  $id: z.string(),\n`;
    schemaString += `  $createdAt: z.string(),\n`;
    schemaString += `  $updatedAt: z.string(),\n`;
    schemaString += `  $permissions: z.array(z.string()),\n`;
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
      let getterBody = "";
      if (isArray) {
        getterBody = isRequired
          ? `${relatedPascalName}Schema.array()`
          : `${relatedPascalName}Schema.array().nullish()`;
      } else {
        getterBody = isRequired
          ? `${relatedPascalName}Schema`
          : `${relatedPascalName}Schema.nullish()`;
      }
      schemaString += `  get ${key}(){\n    return ${getterBody}\n  },\n`;
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
