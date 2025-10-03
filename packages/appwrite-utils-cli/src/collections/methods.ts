import {
  Databases,
  ID,
  Permission,
  Query,
  type Models,
} from "node-appwrite";
import type { AppwriteConfig, CollectionCreate, Indexes, Attribute } from "appwrite-utils";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { getAdapterFromConfig } from "../utils/getClientFromConfig.js";
import {
  nameToIdMapping,
  processQueue,
  queuedOperations,
  clearProcessingState,
  isCollectionProcessed,
  markCollectionProcessed
} from "../shared/operationQueue.js";
import { logger } from "../shared/logging.js";
import { createUpdateCollectionAttributesWithStatusCheck } from "./attributes.js";
import { createOrUpdateIndexesWithStatusCheck } from "./indexes.js";
import { SchemaGenerator } from "../shared/schemaGenerator.js";
import {
  isNull,
  isUndefined,
  isNil,
  isPlainObject,
  isString,
} from "es-toolkit";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { isLegacyDatabases } from "../utils/typeGuards.js";

// Re-export wipe operations
export {
  wipeDatabase,
  wipeCollection,
  wipeAllTables,
  wipeTableRows,
} from "./wipeOperations.js";

// Re-export transfer operations
export {
  transferDocumentsBetweenDbsLocalToLocal,
  transferDocumentsBetweenDbsLocalToRemote,
} from "./transferOperations.js";

export const documentExists = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  targetCollectionId: string,
  toCreateObject: any
): Promise<Models.Document | null> => {
  const collection = await (isLegacyDatabases(db) ?
    db.getCollection(dbId, targetCollectionId) :
    db.getTable({ databaseId: dbId, tableId: targetCollectionId }));
  const attributes = (collection as any).attributes as any[];
  let arrayTypeAttributes = attributes
    .filter((attribute: any) => attribute.array === true)
    .map((attribute: any) => attribute.key);

  const isJsonString = (str: string) => {
    try {
      const json = JSON.parse(str);
      return typeof json === "object" && json !== null;
    } catch (e) {
      return false;
    }
  };

  // Convert object to entries and filter
  const validEntries = Object.entries(toCreateObject).filter(
    ([key, value]) =>
      !arrayTypeAttributes.includes(key) &&
      !key.startsWith("$") &&
      !isNull(value) &&
      !isUndefined(value) &&
      !isNil(value) &&
      !isPlainObject(value) &&
      !Array.isArray(value) &&
      !(isString(value) && isJsonString(value)) &&
      (isString(value) ? value.length < 4096 && value.length > 0 : true)
  );

  // Map and filter valid entries
  const validMappedEntries = validEntries
    .map(([key, value]) => [
      key,
      isString(value) || typeof value === "number" || typeof value === "boolean"
        ? value
        : null,
    ])
    .filter(([key, value]) => !isNull(value) && isString(key))
    .slice(0, 25);

  // Convert to Query parameters
  const validQueryParams = validMappedEntries.map(([key, value]) =>
    Query.equal(key as string, value as any)
  );

  // Execute the query with the validated and prepared parameters
  const result = await (isLegacyDatabases(db) ?
    db.listDocuments(dbId, targetCollectionId, validQueryParams) :
    db.listRows({ databaseId: dbId, tableId: targetCollectionId, queries: validQueryParams }));

  const items = isLegacyDatabases(db) ? result.documents : ((result as any).rows || result.documents);
  return items?.[0] || null;
};

export const checkForCollection = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collection: Partial<CollectionCreate>
): Promise<Models.Collection | null> => {
  try {
    MessageFormatter.progress(`Checking for collection with name: ${collection.name}`, { prefix: "Collections" });
    const response = await tryAwaitWithRetry(
      async () => isLegacyDatabases(db) ?
        await db.listCollections(dbId, [Query.equal("name", collection.name!)]) :
        await db.listTables({ databaseId: dbId, queries: [Query.equal("name", collection.name!)] })
    );
    const items = isLegacyDatabases(db) ? response.collections : ((response as any).tables || response.collections);
    if (items && items.length > 0) {
      MessageFormatter.info(`Collection found: ${items[0].$id}`, { prefix: "Collections" });
      return { ...collection, ...items[0] } as Models.Collection;
    } else {
      MessageFormatter.info(`No collection found with name: ${collection.name}`, { prefix: "Collections" });
      return null;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    MessageFormatter.error(`Error checking for collection: ${collection.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Collections" });
    logger.error('Collection check failed', {
      collectionName: collection.name,
      dbId,
      error: errorMessage,
      operation: 'checkForCollection'
    });
    return null;
  }
};

// Helper function to fetch and cache collection by name
export const fetchAndCacheCollectionByName = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  collectionName: string
): Promise<Models.Collection | undefined> => {
  if (nameToIdMapping.has(collectionName)) {
    const collectionId = nameToIdMapping.get(collectionName);
    MessageFormatter.debug(`Collection found in cache: ${collectionId}`, undefined, { prefix: "Collections" });
    return await tryAwaitWithRetry(
      async () => isLegacyDatabases(db) ?
        await db.getCollection(dbId, collectionId!) :
        await db.getTable({ databaseId: dbId, tableId: collectionId! })
    ) as Models.Collection;
  } else {
    MessageFormatter.progress(`Fetching collection by name: ${collectionName}`, { prefix: "Collections" });
    const collectionsPulled = await tryAwaitWithRetry(
      async () => isLegacyDatabases(db) ?
        await db.listCollections(dbId, [Query.equal("name", collectionName)]) :
        await db.listTables({ databaseId: dbId, queries: [Query.equal("name", collectionName)] })
    );
    const items = isLegacyDatabases(db) ? collectionsPulled.collections : ((collectionsPulled as any).tables || collectionsPulled.collections);
    if ((collectionsPulled.total || items?.length) > 0) {
      const collection = items[0];
      MessageFormatter.info(`Collection found: ${collection.$id}`, { prefix: "Collections" });
      nameToIdMapping.set(collectionName, collection.$id);
      return collection;
    } else {
      MessageFormatter.warning(`Collection not found by name: ${collectionName}`, { prefix: "Collections" });
      return undefined;
    }
  }
};

export const generateSchemas = async (
  config: AppwriteConfig,
  appwriteFolderPath: string
): Promise<void> => {
  const schemaGenerator = new SchemaGenerator(config, appwriteFolderPath);
  schemaGenerator.generateSchemas();
};

export const createOrUpdateCollections = async (
  database: Databases,
  databaseId: string,
  config: AppwriteConfig,
  deletedCollections?: { collectionId: string; collectionName: string }[],
  selectedCollections: Models.Collection[] = []
): Promise<void> => {
  // Clear processing state at the start of a new operation
  clearProcessingState();

  // If API mode is tablesdb, route to adapter-based implementation
  try {
    const { adapter, apiMode } = await getAdapterFromConfig(config);
    if (apiMode === 'tablesdb') {
      await createOrUpdateCollectionsViaAdapter(adapter, databaseId, config, deletedCollections, selectedCollections);
      return;
    }
  } catch {
    // Fallback to legacy path below
  }
  const collectionsToProcess =
    selectedCollections.length > 0 ? selectedCollections : config.collections;
  if (!collectionsToProcess) {
    return;
  }
  const usedIds = new Set();

  MessageFormatter.info(`Processing ${collectionsToProcess.length} collections with intelligent state management`, { prefix: "Collections" });

  for (const collection of collectionsToProcess) {
    const { attributes, indexes, ...collectionData } = collection;

    // Check if this collection has already been processed in this session
    if (collectionData.$id && isCollectionProcessed(collectionData.$id)) {
      MessageFormatter.info(`Collection '${collectionData.name}' already processed, skipping`, { prefix: "Collections" });
      continue;
    }

    // Prepare permissions for the collection
    const permissions: string[] = [];
    if (collection.$permissions && collection.$permissions.length > 0) {
      for (const permission of collection.$permissions) {
        if (typeof permission === "string") {
          permissions.push(permission);
        } else {
          switch (permission.permission) {
            case "read":
              permissions.push(Permission.read(permission.target));
              break;
            case "create":
              permissions.push(Permission.create(permission.target));
              break;
            case "update":
              permissions.push(Permission.update(permission.target));
              break;
            case "delete":
              permissions.push(Permission.delete(permission.target));
              break;
            case "write":
              permissions.push(Permission.write(permission.target));
              break;
            default:
              MessageFormatter.warning(`Unknown permission: ${permission.permission}`, { prefix: "Collections" });
              break;
          }
        }
      }
    }

    // Check if the collection already exists by name
    let collectionsFound = await tryAwaitWithRetry(
      async () =>
        await database.listCollections(databaseId, [
          Query.equal("name", collectionData.name),
        ])
    );

    let collectionToUse =
      collectionsFound.total > 0 ? collectionsFound.collections[0] : null;

    // Determine the correct ID for the collection
    let collectionId: string;
    if (!collectionToUse) {
      MessageFormatter.info(`Creating collection: ${collectionData.name}`, { prefix: "Collections" });
      let foundColl = deletedCollections?.find(
        (coll) =>
          coll.collectionName.toLowerCase().trim().replace(" ", "") ===
          collectionData.name.toLowerCase().trim().replace(" ", "")
      );

      if (collectionData.$id) {
        collectionId = collectionData.$id;
      } else if (foundColl && !usedIds.has(foundColl.collectionId)) {
        collectionId = foundColl.collectionId;
      } else {
        collectionId = ID.unique();
      }

      usedIds.add(collectionId);

      // Create the collection with the determined ID
      try {
        collectionToUse = await tryAwaitWithRetry(
          async () =>
            await database.createCollection(
              databaseId,
              collectionId,
              collectionData.name,
              permissions,
              collectionData.documentSecurity ?? false,
              collectionData.enabled ?? true
            )
        );
        collectionData.$id = collectionToUse!.$id;
        nameToIdMapping.set(collectionData.name, collectionToUse!.$id);
      } catch (error) {
        MessageFormatter.error(
          `Failed to create collection ${collectionData.name} with ID ${collectionId}`,
          error instanceof Error ? error : new Error(String(error)),
          { prefix: "Collections" }
        );
        continue;
      }
    } else {
      MessageFormatter.info(`Collection ${collectionData.name} exists, updating it`, { prefix: "Collections" });
      await tryAwaitWithRetry(
        async () =>
          await database.updateCollection(
            databaseId,
            collectionToUse!.$id,
            collectionData.name,
            permissions,
            collectionData.documentSecurity ?? false,
            collectionData.enabled ?? true
          )
      );
      // Cache the existing collection ID
      nameToIdMapping.set(collectionData.name, collectionToUse.$id);
    }

    // Add delay after creating/updating collection
    await delay(250);

    // Update attributes and indexes for the collection
    MessageFormatter.progress("Creating Attributes", { prefix: "Collections" });
    await createUpdateCollectionAttributesWithStatusCheck(
      database,
      databaseId,
      collectionToUse!,
      // @ts-expect-error
      attributes
    );

    // Add delay after creating attributes
    await delay(250);

    const indexesToUse =
      indexes && indexes.length > 0
        ? indexes
        : config.collections?.find((c) => c.$id === collectionToUse!.$id)
            ?.indexes ?? [];

    MessageFormatter.progress("Creating Indexes", { prefix: "Collections" });
    await createOrUpdateIndexesWithStatusCheck(
      databaseId,
      database,
      collectionToUse!.$id,
      collectionToUse!,
      indexesToUse as Indexes
    );

    // Mark this collection as fully processed to prevent re-processing
    markCollectionProcessed(collectionToUse!.$id, collectionData.name);

    // Add delay after creating indexes
    await delay(250);
  }

  // Process any remaining relationship attributes in the queue
  // This surgical approach only processes specific attributes, not entire collections
  if (queuedOperations.length > 0) {
    MessageFormatter.info(`🔧 Processing ${queuedOperations.length} queued relationship attributes (surgical approach)`, { prefix: "Collections" });
    await processQueue(database, databaseId);
  } else {
    MessageFormatter.info("✅ No queued relationship attributes to process", { prefix: "Collections" });
  }
};

// New: Adapter-based implementation for TablesDB with state management
export const createOrUpdateCollectionsViaAdapter = async (
  adapter: DatabaseAdapter,
  databaseId: string,
  config: AppwriteConfig,
  deletedCollections?: { collectionId: string; collectionName: string }[],
  selectedCollections: Models.Collection[] = []
): Promise<void> => {
  const collectionsToProcess =
    selectedCollections.length > 0 ? selectedCollections : (config.collections || []);
  if (!collectionsToProcess || collectionsToProcess.length === 0) return;

  const usedIds = new Set<string>();
  MessageFormatter.info(`Processing ${collectionsToProcess.length} tables via adapter with intelligent state management`, { prefix: "Tables" });

  // Helper: create attributes through adapter
  const createAttr = async (tableId: string, attr: Attribute) => {
    const base: any = {
      databaseId,
      tableId,
      key: attr.key,
      type: (attr as any).type,
      size: (attr as any).size,
      required: !!(attr as any).required,
      default: (attr as any).xdefault,
      array: !!(attr as any).array,
      min: (attr as any).min,
      max: (attr as any).max,
      elements: (attr as any).elements,
      encrypt: (attr as any).encrypted,
      relatedCollection: (attr as any).relatedCollection,
      relationType: (attr as any).relationType,
      twoWay: (attr as any).twoWay,
      twoWayKey: (attr as any).twoWayKey,
      onDelete: (attr as any).onDelete,
      side: (attr as any).side,
    };
    await adapter.createAttribute(base);
    await delay(150);
  };

  // Local queue for unresolved relationships
  const relQueue: { tableId: string; attr: Attribute }[] = [];

  for (const collection of collectionsToProcess) {
    const { attributes, indexes, ...collectionData } = collection as any;

    // Check if this table has already been processed in this session
    if (collectionData.$id && isCollectionProcessed(collectionData.$id)) {
      MessageFormatter.info(`Table '${collectionData.name}' already processed, skipping`, { prefix: "Tables" });
      continue;
    }

    // Prepare permissions as strings (reuse Permission helper)
    const permissions: string[] = [];
    if (collection.$permissions && collection.$permissions.length > 0) {
      for (const p of collection.$permissions as any[]) {
        if (typeof p === 'string') permissions.push(p);
        else {
          switch (p.permission) {
            case 'read': permissions.push(Permission.read(p.target)); break;
            case 'create': permissions.push(Permission.create(p.target)); break;
            case 'update': permissions.push(Permission.update(p.target)); break;
            case 'delete': permissions.push(Permission.delete(p.target)); break;
            case 'write': permissions.push(Permission.write(p.target)); break;
            default: break;
          }
        }
      }
    }

    // Find existing table by name
    const list = await adapter.listTables({ databaseId, queries: [Query.equal('name', collectionData.name)] });
    const items: any[] = (list as any).tables || [];
    let table = items[0];
    let tableId: string;

    if (!table) {
      // Determine ID (prefer provided $id or re-use deleted one)
      let foundColl = deletedCollections?.find(
        (coll) => coll.collectionName.toLowerCase().trim().replace(" ", "") === collectionData.name.toLowerCase().trim().replace(" ", "")
      );
      if (collectionData.$id) tableId = collectionData.$id;
      else if (foundColl && !usedIds.has(foundColl.collectionId)) tableId = foundColl.collectionId;
      else tableId = ID.unique();
      usedIds.add(tableId);

      const res = await adapter.createTable({
        databaseId,
        id: tableId,
        name: collectionData.name,
        permissions,
        documentSecurity: !!collectionData.documentSecurity,
        enabled: collectionData.enabled !== false
      });
      table = (res as any).data || res;
      nameToIdMapping.set(collectionData.name, tableId);
    } else {
      tableId = table.$id;
      await adapter.updateTable({
        databaseId,
        id: tableId,
        name: collectionData.name,
        permissions,
        documentSecurity: !!collectionData.documentSecurity,
        enabled: collectionData.enabled !== false
      });
      // Cache the existing table ID
      nameToIdMapping.set(collectionData.name, tableId);
    }

    // Add small delay after table create/update
    await delay(250);

    // Create attributes: non-relationship first
    const nonRel = (attributes || []).filter((a: Attribute) => a.type !== 'relationship');
    for (const attr of nonRel) {
      await createAttr(tableId, attr as Attribute);
    }

    // Relationship attributes — resolve relatedCollection to ID
    const rels = (attributes || []).filter((a: Attribute) => a.type === 'relationship');
    for (const attr of rels as any[]) {
      const relNameOrId = attr.relatedCollection as string | undefined;
      if (!relNameOrId) continue;
      let relId = nameToIdMapping.get(relNameOrId) || relNameOrId;

      // If looks like a name (not ULID) and not in cache, try query by name
      if (!nameToIdMapping.has(relNameOrId)) {
        try {
          const relList = await adapter.listTables({ databaseId, queries: [Query.equal('name', relNameOrId)] });
          const relItems: any[] = (relList as any).tables || [];
          if (relItems[0]?.$id) {
            relId = relItems[0].$id;
            nameToIdMapping.set(relNameOrId, relId);
          }
        } catch {}
      }

      if (relId && typeof relId === 'string') {
        attr.relatedCollection = relId;
        await createAttr(tableId, attr as Attribute);
      } else {
        // Defer if unresolved
        relQueue.push({ tableId, attr: attr as Attribute });
      }
    }

    // Indexes
    const idxs = (indexes || []) as any[];
    for (const idx of idxs) {
      try {
        await adapter.createIndex({
          databaseId,
          tableId,
          key: idx.key,
          type: idx.type,
          attributes: idx.attributes,
          orders: idx.orders || []
        });
        await delay(150);
      } catch (e) {
        MessageFormatter.error(`Failed to create index ${idx.key}`, e instanceof Error ? e : new Error(String(e)), { prefix: 'Indexes' });
      }
    }

    // Mark this table as fully processed to prevent re-processing
    markCollectionProcessed(tableId, collectionData.name);
  }

  // Process queued relationships once mapping likely populated
  if (relQueue.length > 0) {
    MessageFormatter.info(`🔧 Processing ${relQueue.length} queued relationship attributes for tables`, { prefix: "Tables" });
    for (const { tableId, attr } of relQueue) {
      const relNameOrId = (attr as any).relatedCollection as string | undefined;
      if (!relNameOrId) continue;
      const relId = nameToIdMapping.get(relNameOrId) || relNameOrId;
      if (relId) {
        (attr as any).relatedCollection = relId;
        try {
          await adapter.createAttribute({
            databaseId,
            tableId,
            key: (attr as any).key,
            type: (attr as any).type,
            size: (attr as any).size,
            required: !!(attr as any).required,
            default: (attr as any).xdefault,
            array: !!(attr as any).array,
            min: (attr as any).min,
            max: (attr as any).max,
            elements: (attr as any).elements,
            relatedCollection: relId,
            relationType: (attr as any).relationType,
            twoWay: (attr as any).twoWay,
            twoWayKey: (attr as any).twoWayKey,
            onDelete: (attr as any).onDelete,
            side: (attr as any).side
          });
          await delay(150);
          MessageFormatter.info(`✅ Successfully processed queued relationship: ${attr.key}`, { prefix: "Tables" });
        } catch (e) {
          MessageFormatter.error(`Failed queued relationship ${attr.key}`, e instanceof Error ? e : new Error(String(e)), { prefix: 'Attributes' });
        }
      } else {
        MessageFormatter.warning(`Could not resolve relationship ${attr.key} -> ${relNameOrId}`, { prefix: "Tables" });
      }
    }
  }
};

export const generateMockData = async (
  database: Databases,
  databaseId: string,
  configCollections: any[]
): Promise<void> => {
  for (const { collection, mockFunction } of configCollections) {
    if (mockFunction) {
      MessageFormatter.progress(`Generating mock data for collection: ${collection.name}`, { prefix: "Mock Data" });
      const mockData = mockFunction();
      for (const data of mockData) {
        await database.createDocument(
          databaseId,
          collection.$id,
          ID.unique(),
          data
        );
      }
    }
  }
};

export const fetchAllCollections = async (
  dbId: string,
  database: Databases
): Promise<Models.Collection[]> => {
  MessageFormatter.progress(`Fetching all collections for database ID: ${dbId}`, { prefix: "Collections" });
  let collections: Models.Collection[] = [];
  let moreCollections = true;
  let lastCollectionId: string | undefined;

  while (moreCollections) {
    const queries = [Query.limit(500)];
    if (lastCollectionId) {
      queries.push(Query.cursorAfter(lastCollectionId));
    }
    const response = await tryAwaitWithRetry(
      async () => await database.listCollections(dbId, queries)
    );
    collections = collections.concat(response.collections);
    moreCollections = response.collections.length === 500;
    if (moreCollections) {
      lastCollectionId =
        response.collections[response.collections.length - 1].$id;
    }
  }

  MessageFormatter.success(`Fetched a total of ${collections.length} collections`, { prefix: "Collections" });
  return collections;
};
