import { CollectionCreate } from "appwrite-utils";

const Members: Partial<CollectionCreate> = {
  name: "Members",
  $permissions: [
    { permission: "read", target: "any" },
    { permission: "create", target: "users" },
    { permission: "update", target: "users" },
    { permission: "delete", target: "users" },
  ],
  attributes: [
    { key: "idOrig", type: "string", size: 255, required: false },
    {
      key: "dogs",
      type: "relationship",
      relatedCollection: "Dogs",
      relationType: "oneToMany",
      twoWay: true,
      twoWayKey: "owner",
      side: "parent",
      onDelete: "cascade",
    },
    { key: "dogIds", type: "string", size: 255, array: true },
    { key: "profilePhoto", type: "string", size: 255, required: false },
    { key: "profilePhotoTest", type: "string", size: 255, required: false },
  ],
  indexes: [{ key: "idOrig_index", type: "key", attributes: ["idOrig"] }],
  importDefs: [
    {
      primaryKeyField: "idOrig",
      filePath: "importData/members.json",
      basePath: "RECORDS",
      attributeMappings: [
        { oldKey: "id", targetKey: "idOrig", converters: ["anyToString"] },
        { oldKey: "name", targetKey: "name" },
        { oldKey: "email", targetKey: "email" },
        {
          oldKey: "doesntMatter",
          targetKey: "profilePhoto",
          fileData: {
            name: "profilePhoto_{id}",
            path: "importData/profilePhotos",
          },
        },
        {
          oldKey: "photoUrl",
          targetKey: "profilePhotoTest",
          fileData: { name: "profilePhotoTest_{id}", path: "{photoUrl}" },
        },
      ],
    },
  ],
};

export default Members;
