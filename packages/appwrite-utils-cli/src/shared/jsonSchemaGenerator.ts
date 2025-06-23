import fs from "fs";
import path from "path";
import type { AppwriteConfig, Attribute, CollectionCreate } from "appwrite-utils";
import { toCamelCase, toPascalCase } from "../utils/index.js";
import chalk from "chalk";

export interface JsonSchemaProperty {
  type: string | string[];
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  items?: JsonSchemaProperty;
  $ref?: string;
  properties?: Record<string, JsonSchemaProperty>;
  additionalProperties?: boolean;
  required?: string[];
  default?: any;
  oneOf?: JsonSchemaProperty[];
}

export interface JsonSchema {
  $schema: string;
  $id: string;
  title: string;
  description?: string;
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
  definitions?: Record<string, JsonSchemaProperty>;
}

export class JsonSchemaGenerator {
  private config: AppwriteConfig;
  private appwriteFolderPath: string;
  private relationshipMap = new Map<string, any[]>();

  constructor(config: AppwriteConfig, appwriteFolderPath: string) {
    this.config = config;
    this.appwriteFolderPath = appwriteFolderPath;
    this.extractRelationships();
  }

  private extractRelationships(): void {
    if (!this.config.collections) return;

    this.config.collections.forEach((collection) => {
      if (!collection.attributes) return;

      collection.attributes.forEach((attr) => {
        if (attr.type === "relationship" && attr.relatedCollection) {
          const relationships = this.relationshipMap.get(collection.name) || [];
          relationships.push({
            attributeKey: attr.key,
            relatedCollection: attr.relatedCollection,
            relationType: attr.relationType,
            isArray: attr.relationType === "oneToMany" || attr.relationType === "manyToMany"
          });
          this.relationshipMap.set(collection.name, relationships);
        }
      });
    });
  }

  private attributeToJsonSchemaProperty(attribute: Attribute): JsonSchemaProperty {
    const property: JsonSchemaProperty = {
      type: "string" // Default type
    };

    // Set description if available
    if (attribute.description) {
      property.description = typeof attribute.description === 'string' 
        ? attribute.description 
        : JSON.stringify(attribute.description);
    }

    // Handle array attributes
    if (attribute.array) {
      property.type = "array";
      property.items = this.getBaseTypeSchema(attribute);
    } else {
      Object.assign(property, this.getBaseTypeSchema(attribute));
    }

    // Set default value (only for attributes that support it)
    if (attribute.type !== "relationship" && "xdefault" in attribute && 
        attribute.xdefault !== undefined && attribute.xdefault !== null) {
      property.default = attribute.xdefault;
    }

    return property;
  }

  private getBaseTypeSchema(attribute: Attribute): JsonSchemaProperty {
    const schema: JsonSchemaProperty = {
      type: "string" // Default type
    };

    switch (attribute.type) {
      case "string":
        schema.type = "string";
        if (attribute.size) {
          schema.maxLength = attribute.size;
        }
        break;

      case "integer":
        schema.type = "integer";
        if (attribute.min !== undefined) {
          schema.minimum = Number(attribute.min);
        }
        if (attribute.max !== undefined) {
          schema.maximum = Number(attribute.max);
        }
        break;

      case "double":
      case "float": // Backward compatibility
        schema.type = "number";
        if (attribute.min !== undefined) {
          schema.minimum = Number(attribute.min);
        }
        if (attribute.max !== undefined) {
          schema.maximum = Number(attribute.max);
        }
        break;

      case "boolean":
        schema.type = "boolean";
        break;

      case "datetime":
        schema.type = "string";
        schema.format = "date-time";
        break;

      case "email":
        schema.type = "string";
        schema.format = "email";
        break;

      case "ip":
        schema.type = "string";
        schema.format = "ipv4";
        break;

      case "url":
        schema.type = "string";
        schema.format = "uri";
        break;

      case "enum":
        schema.type = "string";
        if (attribute.elements) {
          schema.enum = attribute.elements;
        }
        break;

      case "relationship":
        if (attribute.relatedCollection) {
          // For relationships, reference the related collection schema
          schema.$ref = `#/definitions/${toPascalCase(attribute.relatedCollection)}`;
        } else {
          schema.type = "string";
          schema.description = "Document ID reference";
        }
        break;

      default:
        schema.type = "string";
    }

    return schema;
  }

  private createJsonSchema(collection: CollectionCreate): JsonSchema {
    const pascalName = toPascalCase(collection.name);
    const schema: JsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `https://example.com/schemas/${toCamelCase(collection.name)}.json`,
      title: pascalName,
      description: collection.description || `Schema for ${collection.name} collection`,
      type: "object",
      properties: {
        // Standard Appwrite document fields
        $id: {
          type: "string",
          description: "Document ID",
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$"
        },
        $createdAt: {
          type: "string",
          format: "date-time",
          description: "Document creation date"
        },
        $updatedAt: {
          type: "string", 
          format: "date-time",
          description: "Document last update date"
        },
        $permissions: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Document permissions"
        }
      },
      required: ["$id", "$createdAt", "$updatedAt"],
      additionalProperties: false
    };

    // Add custom attributes
    const requiredFields: string[] = [...schema.required];
    
    if (collection.attributes) {
      collection.attributes.forEach((attribute) => {
        schema.properties[attribute.key] = this.attributeToJsonSchemaProperty(attribute);
        
        if (attribute.required) {
          requiredFields.push(attribute.key);
        }
      });
    }

    schema.required = requiredFields;

    // Add relationship definitions if any exist
    const relationships = this.relationshipMap.get(collection.name);
    if (relationships && relationships.length > 0) {
      schema.definitions = {};
      
      relationships.forEach((rel) => {
        const relatedPascalName = toPascalCase(rel.relatedCollection);
        schema.definitions![relatedPascalName] = {
          type: "object",
          properties: {
            $id: { type: "string" },
            $createdAt: { type: "string", format: "date-time" },
            $updatedAt: { type: "string", format: "date-time" }
          },
          additionalProperties: true,
          description: `Reference to ${rel.relatedCollection} document`
        };
      });
    }

    return schema;
  }

  public generateJsonSchemas(options: {
    outputFormat?: "json" | "typescript" | "both";
    outputDirectory?: string;
    verbose?: boolean;
  } = {}): void {
    const { outputFormat = "both", outputDirectory = "schemas", verbose = false } = options;

    if (!this.config.collections) {
      if (verbose) {
        console.log(chalk.yellow("No collections found in config"));
      }
      return;
    }

    // Create JSON schemas directory using provided outputDirectory
    const jsonSchemasPath = path.join(this.appwriteFolderPath, outputDirectory);
    if (!fs.existsSync(jsonSchemasPath)) {
      fs.mkdirSync(jsonSchemasPath, { recursive: true });
    }

    if (verbose) {
      console.log(chalk.blue(`Generating JSON schemas for ${this.config.collections.length} collections...`));
    }

    this.config.collections.forEach((collection) => {
      const schema = this.createJsonSchema(collection);
      const camelCaseName = toCamelCase(collection.name);

      // Generate JSON file
      if (outputFormat === "json" || outputFormat === "both") {
        const jsonPath = path.join(jsonSchemasPath, `${camelCaseName}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(schema, null, 2), { encoding: "utf-8" });
        
        if (verbose) {
          console.log(chalk.green(`✓ JSON schema written to ${jsonPath}`));
        }
      }

      // Generate TypeScript file
      if (outputFormat === "typescript" || outputFormat === "both") {
        const tsContent = this.generateTypeScriptSchema(schema, collection.name);
        const tsPath = path.join(jsonSchemasPath, `${camelCaseName}.schema.ts`);
        fs.writeFileSync(tsPath, tsContent, { encoding: "utf-8" });
        
        if (verbose) {
          console.log(chalk.green(`✓ TypeScript schema written to ${tsPath}`));
        }
      }
    });

    // Generate index file only for TypeScript output
    if (outputFormat === "typescript" || outputFormat === "both") {
      this.generateIndexFile(outputFormat, jsonSchemasPath, verbose);
    }

    if (verbose) {
      console.log(chalk.green("✓ JSON schema generation completed"));
    }
  }

  private generateTypeScriptSchema(schema: JsonSchema, collectionName: string): string {
    const camelName = toCamelCase(collectionName);

    return `// Auto-generated JSON schema for ${collectionName}
import type { JSONSchema7 } from "json-schema";

export const ${camelName}JsonSchema: JSONSchema7 = ${JSON.stringify(schema, null, 2)} as const;

export type ${toPascalCase(collectionName)}JsonSchema = typeof ${camelName}JsonSchema;

export default ${camelName}JsonSchema;
`;
  }

  private generateIndexFile(outputFormat: string, jsonSchemasPath: string, verbose: boolean): void {
    if (!this.config.collections) return;

    const indexPath = path.join(jsonSchemasPath, "index.ts");

    const imports: string[] = [];
    const exports: string[] = [];

    this.config.collections.forEach((collection) => {
      const camelName = toCamelCase(collection.name);
      const pascalName = toPascalCase(collection.name);

      if (outputFormat === "typescript" || outputFormat === "both") {
        imports.push(`import { ${camelName}JsonSchema } from "./${camelName}.schema.js";`);
        exports.push(`  ${camelName}: ${camelName}JsonSchema,`);
      }
    });

    const indexContent = `// Auto-generated index for JSON schemas
${imports.join('\n')}

export const jsonSchemas = {
${exports.join('\n')}
};

export type JsonSchemas = typeof jsonSchemas;

// Individual schema exports
${this.config.collections.map(collection => {
  const camelName = toCamelCase(collection.name);
  return `export { ${camelName}JsonSchema } from "./${camelName}.schema.js";`;
}).join('\n')}

export default jsonSchemas;
`;

    fs.writeFileSync(indexPath, indexContent, { encoding: "utf-8" });

    if (verbose) {
      console.log(chalk.green(`✓ Index file written to ${indexPath}`));
    }
  }

  public validateSchema(schema: JsonSchema): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation
    if (!schema.$schema) {
      errors.push("Missing $schema property");
    }

    if (!schema.title) {
      errors.push("Missing title property");
    }

    if (!schema.properties) {
      errors.push("Missing properties");
    }

    if (!schema.required || !Array.isArray(schema.required)) {
      errors.push("Missing or invalid required array");
    }

    // Validate required Appwrite fields
    const requiredAppwriteFields = ["$id", "$createdAt", "$updatedAt"];
    requiredAppwriteFields.forEach((field) => {
      if (!schema.properties[field]) {
        errors.push(`Missing required Appwrite field: ${field}`);
      }
    });

    return { valid: errors.length === 0, errors };
  }
}