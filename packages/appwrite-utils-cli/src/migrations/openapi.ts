import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  attributeSchema,
  CollectionSchema,
  type AppwriteConfig,
  type Attribute,
  type Collection,
  type CollectionCreate,
} from "appwrite-utils";
import { z } from "zod";
import { writeFileSync } from "fs";

const registry = new OpenAPIRegistry();

export const generateOpenApi = async (config: AppwriteConfig) => {
  if (!config.collections) {
    return;
  }
  for (const collection of config.collections) {
    // Transform and register each attribute schema
    const attributeSchemas = collection.attributes.map((attribute) => {
      return transformTypeToOpenApi(attributeSchema, attribute.description);
    });

    // Create and register the collection schema with descriptions
    const updatedCollectionSchema = CollectionSchema.extend({
      // @ts-ignore
      attributes: attributeSchemas,
    }).openapi(collection.description ?? "No description");

    // Register the updated collection schema under the collection name
    registry.register(collection.name, updatedCollectionSchema);
  }

  // Convert the registry to OpenAPI JSON
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const openApiSpec = generator.generateComponents();

  // Output the OpenAPI spec to a file
  writeFileSync(
    "./appwrite/openapi/openapi.json",
    JSON.stringify(openApiSpec, null, 2)
  );
};

export function transformTypeToOpenApi<T extends z.ZodTypeAny>(
  schema: T,
  description?: string | Record<string, any> | null | undefined
): T {
  // Check if description is an object (OpenAPI properties) or a string
  let updatedSchema: z.infer<T>;
  if (!description) {
    return schema;
  }
  if (typeof description === "string") {
    updatedSchema = schema.openapi(description);
  } else if (typeof description === "object") {
    updatedSchema = schema.openapi(description);
  } else {
    updatedSchema = schema;
  }

  // Check and transform attributes if they exist
  if ((schema as any)._def && (schema as any)._def.shape) {
    const shape = (schema as any)._def.shape();
    for (const key in shape) {
      const attributeDesc = shape[key].description;
      if (attributeDesc) {
        if (typeof attributeDesc === "string") {
          shape[key] = shape[key].openapi(attributeDesc);
        } else if (typeof attributeDesc === "object") {
          shape[key] = shape[key].openapi(attributeDesc);
        }
      }
    }
  }

  return updatedSchema;
}
