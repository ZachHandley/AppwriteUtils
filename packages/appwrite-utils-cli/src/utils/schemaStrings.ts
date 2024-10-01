import { toCamelCase, toPascalCase } from "../utils/index.js";
import { Databases } from "node-appwrite";
import type {
  AppwriteConfig,
  Attribute,
  RelationshipAttribute,
} from "appwrite-utils";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { dump } from "js-yaml";
// import { getClientFromConfig } from "./getClientFromConfig.js";

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

  public updateTsSchemas(): void {
    const collections = this.config.collections;
    delete this.config.collections;

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
    databases: ${JSON.stringify(this.config.databases)},
    buckets: ${JSON.stringify(this.config.buckets)},
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

  private extractRelationships(): void {
    if (!this.config.collections) {
      return;
    }
    this.config.collections.forEach((collection) => {
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
            relationshipAttr.relatedCollection,
            attr.key,
            relationshipAttr.twoWayKey,
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

  public generateSchemas(): void {
    if (!this.config.collections) {
      return;
    }
    this.config.collections.forEach((collection) => {
      const schemaString = this.createSchemaString(
        collection.name,
        collection.attributes
      );
      const camelCaseName = toCamelCase(collection.name);
      const schemaPath = path.join(
        this.appwriteFolderPath,
        "schemas",
        `${camelCaseName}.ts`
      );
      fs.writeFileSync(schemaPath, schemaString, { encoding: "utf-8" });
      console.log(`Schema written to ${schemaPath}`);
    });
  }

  createSchemaString = (name: string, attributes: Attribute[]): string => {
    const pascalName = toPascalCase(name);
    let imports = `import { z } from "zod";\n`;
    const hasDescription = attributes.some((attr) => attr.description);
    if (hasDescription) {
      imports += `import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";\n`;
      imports += `extendZodWithOpenApi(z);\n`;
    }

    // Use the relationshipMap to find related collections
    const relationshipDetails = this.relationshipMap.get(name) || [];
    const relatedCollections = relationshipDetails
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

    let relatedTypes = "";
    let relatedTypesLazy = "";
    let curNum = 0;
    let maxNum = relatedCollections.length;
    relatedCollections.forEach((relatedCollection) => {
      console.log(relatedCollection);
      let relatedPascalName = toPascalCase(relatedCollection[0]);
      let relatedCamelName = toCamelCase(relatedCollection[0]);
      curNum++;
      let endNameTypes = relatedPascalName;
      let endNameLazy = `${relatedPascalName}Schema`;
      if (relatedCollection[2] === "array") {
        endNameTypes += "[]";
        endNameLazy += ".array().default([])";
      } else if (!(relatedCollection[2] === "array")) {
        endNameTypes += " | null";
        endNameLazy += ".nullish()";
      }
      imports += `import { ${relatedPascalName}Schema, type ${relatedPascalName} } from "./${relatedCamelName}";\n`;
      relatedTypes += `${relatedCollection[1]}?: ${endNameTypes};\n`;
      if (relatedTypes.length > 0 && curNum !== maxNum) {
        relatedTypes += "  ";
      }
      relatedTypesLazy += `${relatedCollection[1]}: z.lazy(() => ${endNameLazy}),\n`;
      if (relatedTypesLazy.length > 0 && curNum !== maxNum) {
        relatedTypesLazy += "  ";
      }
    });

    let schemaString = `${imports}\n\n`;
    schemaString += `export const ${pascalName}SchemaBase = z.object({\n`;
    schemaString += `  $id: z.string().optional(),\n`;
    schemaString += `  $createdAt: z.string().optional(),\n`;
    schemaString += `  $updatedAt: z.string().optional(),\n`;
    for (const attribute of attributes) {
      if (attribute.type === "relationship") {
        continue;
      }
      schemaString += `  ${attribute.key}: ${this.typeToZod(attribute)},\n`;
    }
    schemaString += `});\n\n`;
    schemaString += `export type ${pascalName}Base = z.infer<typeof ${pascalName}SchemaBase>`;
    if (relatedTypes.length > 0) {
      schemaString += ` & {\n  ${relatedTypes}};\n\n`;
    } else {
      schemaString += `;\n\n`;
    }
    schemaString += `export const ${pascalName}Schema: z.ZodType<${pascalName}Base> = ${pascalName}SchemaBase`;
    if (relatedTypes.length > 0) {
      schemaString += `.extend({\n  ${relatedTypesLazy}});\n\n`;
    } else {
      schemaString += `;\n`;
    }
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
            delete finalAttribute.min;
          } else {
            baseSchemaCode += `.min(${finalAttribute.min}, "Minimum value of ${finalAttribute.min} not met")`;
          }
        }
        if (finalAttribute.max !== undefined) {
          if (BigInt(finalAttribute.max) === BigInt(9223372036854776000)) {
            delete finalAttribute.max;
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
      case "float":
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
    if (attribute.description) {
      if (typeof attribute.description === "string") {
        baseSchemaCode += `.openapi({ description: "${attribute.description}" })`;
      } else {
        baseSchemaCode += `.openapi(${Object.entries(attribute.description)
          .map(([key, value]) => `"${key}": ${value}`)
          .join(", ")})`;
      }
    }

    return baseSchemaCode;
  };
}
