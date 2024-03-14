import { Permission } from "node-appwrite";
import {
  type Collection,
  type Index,
  type Attribute,
  CollectionCreateSchema,
  indexSchema,
  attributeSchema,
} from "./schema";

export const COLLECTIONS_CONFIG = {
  WordpressMembers: {
    collection: CollectionCreateSchema.parse({
      name: "WordpressMembers",
      enabled: true,
      documentSecurity: false,
      indexes: [],
      $permissions: [
        Permission.read("any"),
        Permission.write("any"),
        Permission.delete("any"),
        Permission.update("any"),
      ],
    }),
    // mockFunction: getBusinessCategoriesMockData,
    // convertFunction: convertBusinessCategories,
    attributes: [
      attributeSchema.parse({
        key: "email",
        type: "string",
        size: 320,
      }),
      attributeSchema.parse({
        key: "member",
        type: "relationship",
        relatedCollection: "Members",
        relationType: "oneToOne",
        twoWay: true,
        twoWayKey: "wordpressMember",
        onDelete: "setNull",
        side: "parent",
      }),
    ],
  },
  Members: {
    collection: CollectionCreateSchema.parse({
      name: "Members",
      enabled: true,
      documentSecurity: false,
      indexes: [],
      $permissions: [
        Permission.read("any"),
        Permission.write("any"),
        Permission.delete("any"),
        Permission.update("any"),
      ],
    }),
    // mockFunction: getBusinessCategoriesMockData,
    // convertFunction: convertBusinessCategories,
    attributes: [
      attributeSchema.parse({
        key: "billingAddress",
        type: "string",
        size: 200,
      }),
      attributeSchema.parse({
        key: "member",
        type: "relationship",
        relatedCollection: "WordpressMembers",
        relationType: "oneToOne",
        twoWay: true,
        twoWayKey: "member",
        onDelete: "setNull",
        side: "child",
      }),
    ],
  },
};
