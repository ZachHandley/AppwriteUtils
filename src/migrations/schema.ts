import { toCamelCase, toPascalCase } from "@/utils";
import { z } from "zod";

const stringAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("string")
    .describe("The type of the attribute")
    .default("string"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid String Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  size: z
    .number()
    .describe("The max length or size of the attribute")
    .default(50),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypted: z
    .boolean()
    .optional()
    .describe("Whether the attribute is encrypted or not"),
});

const integerAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("integer")
    .describe("The type of the attribute")
    .default("integer"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Integer Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  min: z
    .number()
    .int()
    .optional()
    .describe("The minimum value of the attribute"),
  max: z
    .number()
    .int()
    .optional()
    .describe("The maximum value of the attribute"),
  xdefault: z
    .number()
    .int()
    .nullish()
    .describe("The default value of the attribute"),
});

const floatAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("float")
    .describe("The type of the attribute")
    .default("float"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Float Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  min: z.number().optional().describe("The minimum value of the attribute"),
  max: z.number().optional().describe("The maximum value of the attribute"),
  xdefault: z.number().nullish().describe("The default value of the attribute"),
});

const booleanAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("boolean")
    .describe("The type of the attribute")
    .default("boolean"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Boolean Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z
    .boolean()
    .nullish()
    .describe("The default value of the attribute"),
});

const datetimeAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("datetime")
    .describe("The type of the attribute")
    .default("datetime"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Datetime Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

const emailAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("email")
    .describe("The type of the attribute")
    .default("email"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Email Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

const ipAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("ip").describe("The type of the attribute"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid IP Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

const urlAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("url").describe("The type of the attribute").default("url"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid URL Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

const enumAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z.literal("enum").describe("The type of the attribute").default("enum"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Enum Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether the attribute is an array or not"),
  elements: z
    .array(z.string())
    .describe("The elements of the enum attribute")
    .default([]),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
});

const relationshipAttributeSchema = z.object({
  key: z.string().describe("The key of the attribute"),
  type: z
    .literal("relationship")
    .describe("The type of the attribute")
    .default("relationship"),
  error: z
    .string()
    .describe("The error message if the attribute is invalid")
    .default("Invalid Relationship Attribute Schema"),
  required: z
    .boolean()
    .describe("Whether the attribute is required or not")
    .default(false),
  array: z
    .boolean()
    .optional()
    .describe("Whether the attribute is an array or not"),
  relatedCollection: z
    .string()
    .describe("The collection ID of the related collection"),
  relationType: z
    .enum(["oneToMany", "manyToOne", "oneToOne", "manyToMany"])
    .describe("The relation type of the relationship attribute"),
  twoWay: z.boolean().describe("Whether the relationship is two way or not"),
  twoWayKey: z
    .string()
    .describe("The ID of the foreign key in the other collection"),
  onDelete: z
    .enum(["setNull", "cascade", "restrict"])
    .describe("The action to take when the related document is deleted")
    .default("setNull"),
  side: z.enum(["parent", "child"]).describe("The side of the relationship"),
});

export type RelationshipAttribute = z.infer<typeof relationshipAttributeSchema>;

export const attributeSchema = stringAttributeSchema
  .or(integerAttributeSchema)
  .or(floatAttributeSchema)
  .or(booleanAttributeSchema)
  .or(datetimeAttributeSchema)
  .or(emailAttributeSchema)
  .or(ipAttributeSchema)
  .or(urlAttributeSchema)
  .or(enumAttributeSchema)
  .or(relationshipAttributeSchema);

export type Attribute = z.infer<typeof attributeSchema>;

export const indexSchema = z.object({
  key: z.string(),
  type: z.string(),
  status: z.string(),
  error: z.string(),
  attributes: z.array(z.string()),
  orders: z.array(z.string()).optional(),
});

export type Index = z.infer<typeof indexSchema>;

export const collectionSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z.array(z.string()).default([]),
  databaseId: z.string().optional(),
  name: z.string(),
  enabled: z.boolean().default(true),
  documentSecurity: z.boolean().default(false),
  attributes: z.array(z.string()).default([]),
  indexes: z.array(indexSchema).default([]),
});

export const CollectionCreateSchema = collectionSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
  attributes: true,
});

export type Collection = z.infer<typeof collectionSchema>;
export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;

export const BackupSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  database: z.string(),
  collections: z.array(z.string()),
  documents: z
    .array(
      z.object({
        collectionId: z.string(),
        data: z.string(),
      })
    )
    .default([]),
});

export type Backup = z.infer<typeof BackupSchema>;

export const BackupCreateSchema = BackupSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export type BackupCreate = z.infer<typeof BackupCreateSchema>;

export const BatchSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  data: z.string().describe("The serialized data for this batch"),
  processed: z
    .boolean()
    .default(false)
    .describe("Whether the batch has been processed"),
});

export type Batch = z.infer<typeof BatchSchema>;

export const BatchCreateSchema = BatchSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export type BatchCreate = z.infer<typeof BatchCreateSchema>;

export const OperationSchema = z.object({
  $id: z.string(),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  operationType: z.string(),
  collectionId: z.string(),
  data: z.any(),
  batches: z.array(z.string()).default([]).optional(),
  progress: z.number(),
  total: z.number(),
  error: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "error"]),
});

export type Operation = z.infer<typeof OperationSchema>;

export const OperationCreateSchema = OperationSchema.omit({
  $id: true,
  $createdAt: true,
  $updatedAt: true,
});

export type OperationCreate = z.infer<typeof OperationCreateSchema>;

export const getMigrationCollectionSchemas = () => {
  const currentOperationsAttributes: Attribute[] = [
    attributeSchema.parse({
      key: "operationType",
      type: "string",
      error: "Invalid Operation Type",
      required: true,
      array: false,
      xdefault: null,
    }),
    attributeSchema.parse({
      key: "collectionId",
      type: "string",
      error: "Invalid Collection Id",
      size: 50,
      array: false,
      xdefault: null,
    }),
    attributeSchema.parse({
      key: "batches",
      type: "string",
      error: "Invalid Batches",
      size: 1073741824,
      array: true,
    }),
    attributeSchema.parse({
      key: "data",
      type: "string",
      error: "Invalid Data",
      size: 1073741824,
    }),
    attributeSchema.parse({
      key: "progress",
      type: "integer",
      error: "Invalid Progress",
      required: true,
      array: false,
    }),
    attributeSchema.parse({
      key: "total",
      type: "integer",
      error: "Invalid Total",
      required: true,
      array: false,
    }),
    attributeSchema.parse({
      key: "error",
      type: "string",
      error: "Operation Error",
      required: false,
      array: false,
    }),
    attributeSchema.parse({
      key: "status",
      type: "enum",
      elements: ["pending", "in_progress", "completed", "error"],
      error: "Invalid Status",
      array: false,
      xdefault: "pending",
    }),
  ];

  const currentOperationsConfig = CollectionCreateSchema.parse({
    name: "CurrentOperations",
    enabled: true,
    documentSecurity: false,
    attributes: [],
    indexes: [],
  });

  const batchesAttributes: Attribute[] = [
    attributeSchema.parse({
      key: "data",
      type: "string",
      size: 1073741824,
      error: "Invalid Data",
      required: true,
      array: false,
    }),
    attributeSchema.parse({
      key: "processed",
      type: "boolean",
      error: "Invalid Processed",
      required: true,
      array: false,
      xdefault: false,
    }),
  ];

  const batchesConfig = CollectionCreateSchema.parse({
    name: "Batches",
    enabled: true,
    documentSecurity: false,
    attributes: [],
    indexes: [],
  });

  const toReturn = {
    CurrentOperations: {
      collection: currentOperationsConfig,
      attributes: currentOperationsAttributes,
    },
    Batches: {
      collection: batchesConfig,
      attributes: batchesAttributes,
    },
  };
  return toReturn;
};

export const createSchemaString = (
  name: string,
  attributes: Attribute[]
): string => {
  // So the name is camelCase, but the schema is PascalCase (capitalized)
  // What if there's more than just the first letter?
  // What if the name is already PascalCase?
  const pascalName = toPascalCase(name);

  let imports = `import { z } from "zod";\nimport { generateMock } from "@anatine/zod-mock";\n`;

  // Collect unique related collections for relationship attributes
  const relatedCollections = attributes
    .filter((attr) => attr.type === "relationship" && attr.relatedCollection)
    .map((attr) => [
      (attr as RelationshipAttribute).relatedCollection,
      attr.key,
      attr.array ? "array" : "",
    ])
    .filter((value, index, self) => self.indexOf(value) === index);

  // Generate import statements for each unique related collection
  let relatedTypes = "";
  let relatedTypesLazy = "";
  let curNum = 0;
  let maxNum = relatedCollections.length;
  relatedCollections.forEach((relatedCollection) => {
    const relatedPascalName = toPascalCase(relatedCollection[0]);
    const relatedCamelName = toCamelCase(relatedCollection[0]);
    curNum++;
    let endNameTypes = relatedPascalName;
    let endNameLazy = `${relatedPascalName}Schema`;
    if (relatedCollection[2] === "array") {
      endNameTypes += "[]";
      endNameLazy += ".array()";
    }
    endNameLazy += ".optional()";
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
  schemaString += `  $createdAt: z.date().or(z.string()).optional(),\n`;
  schemaString += `  $updatedAt: z.date().or(z.string()).optional(),\n`;
  for (const attribute of attributes) {
    if (attribute.type === "relationship") {
      continue;
    }
    schemaString += `  ${attribute.key}: ${typeToZod(attribute)},\n`;
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
  schemaString += `export const get${pascalName}MockData = (numMocks: number = 1) => {\n`;
  schemaString += `  const mocksGenerated: ${pascalName}[] = [];\n`;
  schemaString += `  for (let i = 0; i < numMocks; i++) {\n`;
  schemaString += `    mocksGenerated.push(generateMock(${pascalName}Schema, { seed: i }));\n`;
  schemaString += `  }\n`;
  schemaString += `  return mocksGenerated;\n`;
  schemaString += `};\n\n`;
  return schemaString;
};

export const typeToZod = (attribute: Attribute) => {
  let baseSchemaCode = "";

  switch (attribute.type) {
    case "string":
      baseSchemaCode = "z.string()";
      if (attribute.size) {
        baseSchemaCode += `.max(${attribute.size}, "Maximum length of ${attribute.size} characters exceeded")`;
      }
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "integer":
      baseSchemaCode = "z.number().int()";
      if (attribute.min !== undefined) {
        baseSchemaCode += `.min(${attribute.min}, "Minimum value of ${attribute.min} not met")`;
      }
      if (attribute.max !== undefined) {
        baseSchemaCode += `.max(${attribute.max}, "Maximum value of ${attribute.max} exceeded")`;
      }
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(${attribute.xdefault})`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "float":
      baseSchemaCode = "z.number()";
      if (attribute.min !== undefined) {
        baseSchemaCode += `.min(${attribute.min}, "Minimum value of ${attribute.min} not met")`;
      }
      if (attribute.max !== undefined) {
        baseSchemaCode += `.max(${attribute.max}, "Maximum value of ${attribute.max} exceeded")`;
      }
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(${attribute.xdefault})`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "boolean":
      baseSchemaCode = "z.boolean()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(${attribute.xdefault})`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "datetime":
      baseSchemaCode = "z.date()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default(new Date("${attribute.xdefault}"))`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "email":
      baseSchemaCode = "z.string().email()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "ip":
      baseSchemaCode = "z.string()"; // Add custom validation as needed
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "url":
      baseSchemaCode = "z.string().url()";
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "enum":
      baseSchemaCode = `z.enum([${attribute.elements
        .map((element) => `"${element}"`)
        .join(", ")}])`;
      if (attribute.xdefault !== undefined) {
        baseSchemaCode += `.default("${attribute.xdefault}")`;
      }
      if (!attribute.required && !attribute.array) {
        baseSchemaCode += ".nullish()";
      }
      break;
    case "relationship":
      // const relatedSchemaName =
      //   toCamelCase(attribute.relatedCollection) + "Schema";
      // baseSchemaCode = `z.lazy(() => ${relatedSchemaName}`;
      // if (attribute.array) {
      //   baseSchemaCode += `.array()`;
      // }
      // if (!attribute.required && !attribute.array) {
      //   baseSchemaCode += ".nullish()";
      // }
      // baseSchemaCode += ")";
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
