import { CollectionCreate } from "appwrite-utils";

const Dogs: Partial<CollectionCreate> = {
  name: "Dogs",
  $permissions: [
    { permission: "read", target: "any" },
    { permission: "create", target: "users" },
    { permission: "update", target: "users" },
    { permission: "delete", target: "users" },
  ],
  attributes: [
    { key: "name", type: "string", size: 255, required: true },
    { key: "breed", type: "string", size: 255, required: false },
    { key: "age", type: "integer", required: false, min: 0, max: 100 },
    { key: "idOrig", type: "string", size: 20, required: false },
    { key: "ownerIdOrig", type: "string", size: 255, required: false },
    { key: "vetRecords", type: "string", size: 255, required: false },
    {
      key: "vetRecordIds",
      type: "string",
      size: 255,
      array: true,
      required: false,
    },
  ],
  indexes: [{ key: "ownerIdIndex", type: "key", attributes: ["ownerIdOrig"] }],
  importDefs: [
    {
      primaryKeyField: "idOrig",
      filePath: "importData/dogs.json",
      basePath: "RECORDS",
      attributeMappings: [
        { oldKey: "id", targetKey: "idOrig" },
        { oldKey: "name", targetKey: "name" },
        { oldKey: "breed", targetKey: "breed" },
        { oldKey: "age", targetKey: "age" },
        { oldKey: "ownerId", targetKey: "ownerIdOrig" },
        {
          oldKey: "vetRecords",
          targetKey: "vetRecords",
          converters: ["stringifyObject"],
        },
        {
          oldKey: "vetRecords.[any].id",
          targetKey: "vetRecordIds",
          converters: ["anyToString"],
        },
      ],
      type: "update",
      updateMapping: { originalIdField: "id", targetField: "idOrig" },
    },
  ],
};
