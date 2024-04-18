import { ID, IndexType } from "node-appwrite";
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
    .optional()
    .default(50),
  xdefault: z.string().nullish().describe("The default value of the attribute"),
  encrypted: z
    .boolean()
    .optional()
    .describe("Whether the attribute is encrypted or not"),
});

type StringAttribute = z.infer<typeof stringAttributeSchema>;

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

type IntegerAttribute = z.infer<typeof integerAttributeSchema>;

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

type FloatAttribute = z.infer<typeof floatAttributeSchema>;

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

type BooleanAttribute = z.infer<typeof booleanAttributeSchema>;

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

type DatetimeAttribute = z.infer<typeof datetimeAttributeSchema>;

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

type EmailAttribute = z.infer<typeof emailAttributeSchema>;

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

type IpAttribute = z.infer<typeof ipAttributeSchema>;

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

type UrlAttribute = z.infer<typeof urlAttributeSchema>;

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

type EnumAttribute = z.infer<typeof enumAttributeSchema>;

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
  importMapping: z
    .object({
      originalIdField: z
        .string()
        .describe(
          "The field in the import data representing the original ID to match"
        ),
      targetField: z
        .string()
        .optional()
        .describe(
          "The field in the target collection that matches the original ID. Optional, defaults to the same as originalIdField if not provided"
        ),
    })
    .optional()
    .describe(
      "Configuration for mapping and resolving relationships during data import"
    ),
});

export type RelationshipAttribute = z.infer<typeof relationshipAttributeSchema>;

export const createRelationshipAttributes = (
  relatedCollection: string,
  relationType: "oneToMany" | "manyToOne" | "oneToOne" | "manyToMany",
  twoWay: boolean,
  twoWayKey: string,
  onDelete: "setNull" | "cascade" | "restrict",
  side: "parent" | "child"
) => {
  return relationshipAttributeSchema.parse({
    relatedCollection,
    relationType,
    twoWay,
    twoWayKey,
    onDelete,
    side,
  });
};

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

export const parseAttribute = (
  attribute:
    | StringAttribute
    | IntegerAttribute
    | FloatAttribute
    | BooleanAttribute
    | DatetimeAttribute
    | EmailAttribute
    | IpAttribute
    | UrlAttribute
    | EnumAttribute
    | RelationshipAttribute
) => {
  if (attribute.type === "string") {
    return stringAttributeSchema.parse(attribute);
  } else if (attribute.type === "integer") {
    return integerAttributeSchema.parse(attribute);
  } else if (attribute.type === "float") {
    return floatAttributeSchema.parse(attribute);
  } else if (attribute.type === "boolean") {
    return booleanAttributeSchema.parse(attribute);
  } else if (attribute.type === "datetime") {
    return datetimeAttributeSchema.parse(attribute);
  } else if (attribute.type === "email") {
    return emailAttributeSchema.parse(attribute);
  } else if (attribute.type === "ip") {
    return ipAttributeSchema.parse(attribute);
  } else if (attribute.type === "url") {
    return urlAttributeSchema.parse(attribute);
  } else if (attribute.type === "enum") {
    return enumAttributeSchema.parse(attribute);
  } else if (attribute.type === "relationship") {
    return relationshipAttributeSchema.parse(attribute);
  } else {
    throw new Error("Invalid attribute type");
  }
};

export type Attribute = z.infer<typeof attributeSchema>;

export const indexSchema = z.object({
  key: z.string(),
  type: z
    .enum([IndexType.Key, IndexType.Unique, IndexType.Fulltext])
    .optional()
    .default(IndexType.Key),
  status: z.string().optional(),
  error: z.string().optional(),
  attributes: z.array(z.string()),
  orders: z.array(z.string()).optional(),
});

export type Index = z.infer<typeof indexSchema>;

export const collectionSchema = z.object({
  $id: z
    .string()
    .optional()
    .default(ID.unique())
    .describe("The ID of the collection, auto generated if not provided"),
  $createdAt: z.string(),
  $updatedAt: z.string(),
  $permissions: z
    .array(
      z.object({
        permission: z.string(),
        target: z.string(),
      })
    )
    .default([])
    .describe("The permissions of the collection"),
  databaseId: z
    .string()
    .optional()
    .describe("The ID of the database the collection belongs to"),
  name: z.string().describe("The name of the collection"),
  enabled: z
    .boolean()
    .default(true)
    .describe("Whether the collection is enabled or not"),
  documentSecurity: z
    .boolean()
    .default(false)
    .describe("Whether document security is enabled or not"),
  attributes: z
    .array(attributeSchema)
    .default([])
    .describe("The attributes of the collection"),
  indexes: z
    .array(indexSchema)
    .default([])
    .describe("The indexes of the collection"),
  importDefs: z
    .array(
      z.object({
        type: z
          .enum(["create", "update"])
          .default("create")
          .optional()
          .describe(
            "The type of import action, if update you should set an object for the originalIdField and targetField"
          ),
        filePath: z.string().describe("The file path of the data to import"),
        basePath: z
          .string()
          .optional()
          .describe(
            "The base path of the import e.g. if you have JSON, and the array is in the RECORDS object, then this would be RECORDS, if nothing then leave it gone"
          ),
        updateMapping: z
          .object({
            originalIdField: z
              .string()
              .describe(
                "The field in the import data representing the original ID to match"
              ),
            targetField: z
              .string()
              .describe(
                "The field in the target collection that matches the original ID. Optional, defaults to the same as originalIdField if not provided"
              ),
          })
          .optional()
          .describe(
            "Configuration for mapping and resolving the update during data import"
          ),
        attributeMappings: z.array(
          z.object({
            oldKey: z
              .string()
              .optional()
              .describe("The key of the attribute in the old document"),
            oldKeys: z
              .array(z.string())
              .optional()
              .describe(
                "The keys of the attribute in the old document, if there are more than one"
              ),
            targetKey: z
              .string()
              .describe("The key of the attribute in the new document"),
            fileData: z
              .object({
                name: z
                  .string()
                  .describe("The name of the file, can use template strings"),
                path: z
                  .string()
                  .describe(
                    "The path of the file, relative to the appwrite folder"
                  ),
              })
              .optional()
              .describe(
                "The file data to use for the import, if defined it will upload and replace with ID"
              ),
            converters: z
              .array(z.string())
              .describe("The converters to use for the import")
              .default([]),
            validationActions: z
              .array(
                z.object({
                  action: z.string(),
                  params: z.array(z.string().startsWith("{").endsWith("}")),
                })
              )
              .describe(
                "The after import actions and parameter placeholders (they'll be replaced with the actual data) to use for the import"
              )
              .default([]),
            postImportActions: z
              .array(
                z.object({
                  action: z.string(),
                  params: z.array(z.string().or(z.record(z.string(), z.any()))),
                })
              )
              .describe(
                "The after import actions and parameter placeholders (they'll be replaced with the actual data) to use for the import"
              )
              .default([]),
          })
        ),
      })
    )
    .optional()
    .default([])
    .describe("The import definitions of the collection, if needed"),
});

export const CollectionCreateSchema = collectionSchema.omit({
  $createdAt: true,
  $updatedAt: true,
});

export type Collection = z.infer<typeof collectionSchema>;
export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;

export const AppwriteConfigSchema = z.object({
  appwriteEndpoint: z.string().default("https://cloud.appwrite.io/v1"),
  appwriteProject: z.string(),
  appwriteKey: z.string(),
  appwriteClient: z.any().or(z.null()).default(null),
  enableDevDatabase: z
    .boolean()
    .default(true)
    .describe("Enable development database alongside production database"),
  enableBackups: z.boolean().default(true).describe("Enable backups"),
  backupInterval: z
    .number()
    .default(3600)
    .describe("Backup interval in seconds"),
  backupRetention: z.number().default(30).describe("Backup retention in days"),
  enableBackupCleanup: z
    .boolean()
    .default(true)
    .describe("Enable backup cleanup"),
  enableMockData: z.boolean().default(false).describe("Enable mock data"),
  enableWipeOtherDatabases: z
    .boolean()
    .default(true)
    .describe("Enable wiping other databases"),
  documentBucketId: z
    .string()
    .default("documents")
    .describe("Documents bucket id for imported documents"),
  usersCollectionName: z
    .string()
    .default("Members")
    .describe(
      "Users collection name for any overflowing data associated with users, will try to match one of the collections by name"
    ),
  databases: z
    .array(
      z.object({
        $id: z.string(),
        name: z.string(),
      })
    )
    .default([
      { $id: "dev", name: "Development" },
      { $id: "main", name: "Main" },
      { $id: "migrations", name: "Migrations" },
    ])
    .describe("Databases to create, $id is the id of the database"),
  collections: z
    .array(CollectionCreateSchema)
    .optional()
    .default([])
    .describe(
      "Collections to create, $id is the id of the collection, it'll always check by collection name and $id for existing before creating another"
    ),
});

export type AppwriteConfig = z.infer<typeof AppwriteConfigSchema>;
export type ConfigCollections = AppwriteConfig["collections"];
export type ConfigCollection = ConfigCollections[number];
export type ConfigDatabases = AppwriteConfig["databases"];
export type ConfigDatabase = ConfigDatabases[number];
export type ImportDefs = ConfigCollections[number]["importDefs"];
export type ImportDef = ImportDefs[number];
export type AttributeMappings = ImportDefs[number]["attributeMappings"];
export type AttributeMapping = AttributeMappings[number];