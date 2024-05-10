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
      return transformTypeToOpenApi(attributeSchema);
    });

    // Create and register the collection schema with descriptions
    const updatedCollectionSchema = CollectionSchema.extend({
      // @ts-ignore
      attributes: z.array(z.union(attributeSchemas)),
    }).openapi(collection.description ?? "No description");

    // Register the updated collection schema under the collection name
    registry.register(collection.name, updatedCollectionSchema);
  }

  // Convert the registry to OpenAPI JSON
  // @ts-ignore
  const openApiSpec = registry.toOpenAPI();

  // Output the OpenAPI spec to a file
  writeFileSync(
    "./appwrite/openapi/openapi.json",
    JSON.stringify(openApiSpec, null, 2)
  );
};

export function transformTypeToOpenApi<T extends z.ZodTypeAny>(
  schema: T
): z.infer<T> {
  return schema.transform((data) => {
    let finalData = data;
    if (data._def.attributes) {
      finalData._def.attributes = data._def.attributes.map(
        (attribute: typeof attributeSchema) => {
          if (attribute.description) {
            return attribute.openapi(attribute.description);
          }
          return attribute;
        }
      );
    }
    if (schema.description) {
      finalData.openapi(schema.description);
    }
    return finalData;
  });
}
