import {
  Client,
  Databases,
  ID,
  Permission,
  Query,
  type Models,
} from "node-appwrite";
import type { AppwriteConfig, CollectionCreate, Indexes, Attribute } from "appwrite-utils";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import { getAdapterFromConfig } from "../utils/getClientFromConfig.js";
import { nameToIdMapping, processQueue, queuedOperations } from "../shared/operationQueue.js";
import { createUpdateCollectionAttributes, createUpdateCollectionAttributesWithStatusCheck } from "./attributes.js";
import { createOrUpdateIndexes, createOrUpdateIndexesWithStatusCheck } from "./indexes.js";
import { SchemaGenerator } from "../shared/schemaGenerator.js";
import {
  isNull,
  isUndefined,
  isNil,
  isPlainObject,
  isString,
  isJSONValue,
  chunk,
} from "es-toolkit";
import { delay, tryAwaitWithRetry } from "../utils/helperFunctions.js";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { ProgressManager } from "../shared/progressManager.js";
import chalk from "chalk";

export const documentExists = async (
  db: Databases | DatabaseAdapter,
  dbId: string,
  targetCollectionId: string,
  toCreateObject: any
): Promise<Models.Document | null> => {
  const collection = await (db instanceof Databases ? 
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
  const result = await (db instanceof Databases ?
    db.listDocuments(dbId, targetCollectionId, validQueryParams) :
    db.listRows({ databaseId: dbId, tableId: targetCollectionId, queries: validQueryParams }));
  
  const items = db instanceof Databases ? result.documents : ((result as any).rows || result.documents);
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
      async () => db instanceof Databases ?
        await db.listCollections(dbId, [Query.equal("name", collection.name!)]) :
        await db.listTables({ databaseId: dbId, queries: [Query.equal("name", collection.name!)] })
    );
    const items = db instanceof Databases ? response.collections : ((response as any).tables || response.collections);
    if (items && items.length > 0) {
      MessageFormatter.info(`Collection found: ${items[0].$id}`, { prefix: "Collections" });
      return { ...collection, ...items[0] } as Models.Collection;
    } else {
      MessageFormatter.info(`No collection found with name: ${collection.name}`, { prefix: "Collections" });
      return null;
    }
  } catch (error) {
    MessageFormatter.error(`Error checking for collection: ${collection.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Collections" });
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
      async () => db instanceof Databases ?
        await db.getCollection(dbId, collectionId!) :
        await db.getTable({ databaseId: dbId, tableId: collectionId! })
    ) as Models.Collection;
  } else {
    MessageFormatter.progress(`Fetching collection by name: ${collectionName}`, { prefix: "Collections" });
    const collectionsPulled = await tryAwaitWithRetry(
      async () => db instanceof Databases ?
        await db.listCollections(dbId, [Query.equal("name", collectionName)]) :
        await db.listTables({ databaseId: dbId, queries: [Query.equal("name", collectionName)] })
    );
    const items = db instanceof Databases ? collectionsPulled.collections : ((collectionsPulled as any).tables || collectionsPulled.collections);
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

async function wipeDocumentsFromCollection(
  database: Databases,
  databaseId: string,
  collectionId: string
) {
  try {
    const initialDocuments = await database.listDocuments(
      databaseId,
      collectionId,
      [Query.limit(1000)]
    );
    let documents = initialDocuments.documents;
    let totalDocuments = documents.length;
    let cursor =
      initialDocuments.documents.length >= 1000
        ? initialDocuments.documents[initialDocuments.documents.length - 1].$id
        : undefined;

    while (cursor) {
      const docsResponse = await database.listDocuments(
        databaseId,
        collectionId,
        [Query.limit(1000), ...(cursor ? [Query.cursorAfter(cursor)] : [])]
      );
      documents.push(...docsResponse.documents);
      totalDocuments = documents.length;
      cursor =
        docsResponse.documents.length >= 1000
          ? docsResponse.documents[docsResponse.documents.length - 1].$id
          : undefined;
      if (totalDocuments % 10000 === 0) {
        MessageFormatter.progress(`Found ${totalDocuments} documents...`, { prefix: "Wipe" });
      }
    }

    MessageFormatter.info(`Found ${totalDocuments} documents to delete`, { prefix: "Wipe" });
    
    if (totalDocuments === 0) {
      MessageFormatter.info("No documents to delete", { prefix: "Wipe" });
      return;
    }
    
    // Create progress tracker for deletion
    const progress = ProgressManager.create(
      `delete-${collectionId}`,
      totalDocuments,
      { title: "Deleting documents" }
    );

    const maxStackSize = 50; // Reduced batch size
    const docBatches = chunk(documents, maxStackSize);
    let documentsProcessed = 0;

    for (let i = 0; i < docBatches.length; i++) {
      const batch = docBatches[i];
      const deletePromises = batch.map(async (doc) => {
        try {
          await tryAwaitWithRetry(async () =>
            database.deleteDocument(databaseId, collectionId, doc.$id)
          );
          documentsProcessed++;
          progress.update(documentsProcessed);
        } catch (error: any) {
          // Skip if document doesn't exist or other non-critical errors
          if (
            !error.message?.includes(
              "Document with the requested ID could not be found"
            )
          ) {
            MessageFormatter.error(
              `Failed to delete document ${doc.$id}`,
              error.message,
              { prefix: "Wipe" }
            );
          }
          documentsProcessed++;
          progress.update(documentsProcessed);
        }
      });

      await Promise.all(deletePromises);
      await delay(50); // Increased delay between batches

      // Progress is now handled by ProgressManager automatically
    }

    progress.stop();
    MessageFormatter.success(
      `Completed deletion of ${totalDocuments} documents from collection ${collectionId}`,
      { prefix: "Wipe" }
    );
  } catch (error) {
    MessageFormatter.error(
      `Error wiping documents from collection ${collectionId}`,
      error instanceof Error ? error : new Error(String(error)),
      { prefix: "Wipe" }
    );
    throw error;
  }
}

export const wipeDatabase = async (
  database: Databases,
  databaseId: string
): Promise<{ collectionId: string; collectionName: string }[]> => {
  MessageFormatter.info(`Wiping database: ${databaseId}`, { prefix: "Wipe" });
  const existingCollections = await fetchAllCollections(databaseId, database);
  let collectionsDeleted: { collectionId: string; collectionName: string }[] =
    [];
  
  if (existingCollections.length === 0) {
    MessageFormatter.info("No collections to delete", { prefix: "Wipe" });
    return collectionsDeleted;
  }
  
  const progress = ProgressManager.create(
    `wipe-db-${databaseId}`,
    existingCollections.length,
    { title: "Deleting collections" }
  );
  
  let processed = 0;
  for (const { $id: collectionId, name: name } of existingCollections) {
    MessageFormatter.progress(`Deleting collection: ${collectionId}`, { prefix: "Wipe" });
    collectionsDeleted.push({
      collectionId: collectionId,
      collectionName: name,
    });
    tryAwaitWithRetry(
      async () => await database.deleteCollection(databaseId, collectionId)
    ); // Try to delete the collection and ignore errors if it doesn't exist or if it's already being deleted
    processed++;
    progress.update(processed);
    await delay(100);
  }
  
  progress.stop();
  MessageFormatter.success(`Deleted ${collectionsDeleted.length} collections from database`, { prefix: "Wipe" });
  return collectionsDeleted;
};

export const wipeCollection = async (
  database: Databases,
  databaseId: string,
  collectionId: string
): Promise<void> => {
  const collections = await database.listCollections(databaseId, [
    Query.equal("$id", collectionId),
  ]);
  if (collections.total === 0) {
    MessageFormatter.warning(`Collection ${collectionId} not found`, { prefix: "Wipe" });
    return;
  }
  const collection = collections.collections[0];
  await wipeDocumentsFromCollection(database, databaseId, collection.$id);
};

// TablesDB helpers for wiping
export const wipeAllTables = async (
  adapter: DatabaseAdapter,
  databaseId: string
): Promise<{ tableId: string; tableName: string }[]> => {
  MessageFormatter.info(`Wiping tables in database: ${databaseId}`, { prefix: 'Wipe' });
  const res = await adapter.listTables({ databaseId, queries: [Query.limit(500)] });
  const tables: any[] = (res as any).tables || [];
  const deleted: { tableId: string; tableName: string }[] = [];
  const progress = ProgressManager.create(`wipe-db-${databaseId}`, tables.length, { title: 'Deleting tables' });
  let processed = 0;
  for (const t of tables) {
    try {
      await adapter.deleteTable({ databaseId, tableId: t.$id });
      deleted.push({ tableId: t.$id, tableName: t.name });
    } catch (e) {
      MessageFormatter.error(`Failed deleting table ${t.$id}`, e instanceof Error ? e : new Error(String(e)), { prefix: 'Wipe' });
    }
    processed++; progress.update(processed);
    await delay(100);
  }
  progress.stop();
  return deleted;
};

export const wipeTableRows = async (
  adapter: DatabaseAdapter,
  databaseId: string,
  tableId: string
): Promise<void> => {
  try {
    const initial = await adapter.listRows({ databaseId, tableId, queries: [Query.limit(1000)] });
    let rows: any[] = (initial as any).rows || [];
    let total = rows.length;
    let cursor = rows.length >= 1000 ? rows[rows.length - 1].$id : undefined;
    while (cursor) {
      const resp = await adapter.listRows({ databaseId, tableId, queries: [Query.limit(1000), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
      const more: any[] = (resp as any).rows || [];
      rows.push(...more);
      total = rows.length;
      cursor = more.length >= 1000 ? more[more.length - 1].$id : undefined;
      if (total % 10000 === 0) {
        MessageFormatter.progress(`Found ${total} rows...`, { prefix: 'Wipe' });
      }
    }
    MessageFormatter.info(`Found ${total} rows to delete`, { prefix: 'Wipe' });
    if (total === 0) return;
    const progress = ProgressManager.create(`delete-${tableId}`, total, { title: 'Deleting rows' });
    let processed = 0;
    const maxStackSize = 50;
    const batches = chunk(rows, maxStackSize);
    for (const batch of batches) {
      await Promise.all(batch.map(async (row: any) => {
        try {
          await adapter.deleteRow({ databaseId, tableId, id: row.$id });
        } catch (e: any) {
          // ignore missing rows
        }
        processed++; progress.update(processed);
      }));
      await delay(50);
    }
    progress.stop();
    MessageFormatter.success(`Completed deletion of ${total} rows from table ${tableId}`, { prefix: 'Wipe' });
  } catch (error) {
    MessageFormatter.error(`Error wiping rows from table ${tableId}`, error instanceof Error ? error : new Error(String(error)), { prefix: 'Wipe' });
    throw error;
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

  for (const collection of collectionsToProcess) {
    const { attributes, indexes, ...collectionData } = collection;

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

    // Add delay after creating indexes
    await delay(250);
  }
  // Process any remaining tasks in the queue (only if there are operations to process)
  if (queuedOperations.length > 0) {
    MessageFormatter.info(`Processing ${queuedOperations.length} queued operations (relationship dependencies)`, { prefix: "Collections" });
    await processQueue(database, databaseId);
  } else {
    MessageFormatter.info("No queued operations to process", { prefix: "Collections" });
  }
};

// New: Adapter-based implementation for TablesDB
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
  }

  // Process queued relationships once mapping likely populated
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
      } catch (e) {
        MessageFormatter.error(`Failed queued relationship ${attr.key}`, e instanceof Error ? e : new Error(String(e)), { prefix: 'Attributes' });
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

/**
 * Transfers all documents from one collection to another in a different database
 * within the same Appwrite Project
 */
export const transferDocumentsBetweenDbsLocalToLocal = async (
  db: Databases,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  let fromCollDocs = await tryAwaitWithRetry(async () =>
    db.listDocuments(fromDbId, fromCollId, [Query.limit(50)])
  );
  let totalDocumentsTransferred = 0;

  if (fromCollDocs.documents.length === 0) {
    MessageFormatter.info(`No documents found in collection ${fromCollId}`, { prefix: "Transfer" });
    return;
  } else if (fromCollDocs.documents.length < 50) {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: any = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(
        async () =>
          await db.createDocument(
            toDbId,
            toCollId,
            doc.$id,
            toCreateObject,
            doc.$permissions
          )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
  } else {
    const batchedPromises = fromCollDocs.documents.map((doc) => {
      const toCreateObject: any = {
        ...doc,
      };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      return tryAwaitWithRetry(async () =>
        db.createDocument(
          toDbId,
          toCollId,
          doc.$id,
          toCreateObject,
          doc.$permissions
        )
      );
    });
    await Promise.all(batchedPromises);
    totalDocumentsTransferred += fromCollDocs.documents.length;
    while (fromCollDocs.documents.length === 50) {
      fromCollDocs = await tryAwaitWithRetry(
        async () =>
          await db.listDocuments(fromDbId, fromCollId, [
            Query.limit(50),
            Query.cursorAfter(
              fromCollDocs.documents[fromCollDocs.documents.length - 1].$id
            ),
          ])
      );
      const batchedPromises = fromCollDocs.documents.map((doc) => {
        const toCreateObject: any = {
          ...doc,
        };
        delete toCreateObject.$databaseId;
        delete toCreateObject.$collectionId;
        delete toCreateObject.$createdAt;
        delete toCreateObject.$updatedAt;
        delete toCreateObject.$id;
        delete toCreateObject.$permissions;
        return tryAwaitWithRetry(
          async () =>
            await db.createDocument(
              toDbId,
              toCollId,
              doc.$id,
              toCreateObject,
              doc.$permissions
            )
        );
      });
      await Promise.all(batchedPromises);
      totalDocumentsTransferred += fromCollDocs.documents.length;
    }
  }

  MessageFormatter.success(
    `Transferred ${totalDocumentsTransferred} documents from database ${fromDbId} to database ${toDbId} -- collection ${fromCollId} to collection ${toCollId}`,
    { prefix: "Transfer" }
  );
};

/**
 * Enhanced document transfer with fault tolerance and exponential backoff
 */
const transferDocumentWithRetry = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  documentId: string,
  documentData: any,
  permissions: string[],
  maxRetries: number = 3,
  retryCount: number = 0
): Promise<boolean> => {
  try {
    await db.createDocument(
      dbId,
      collectionId,
      documentId,
      documentData,
      permissions
    );
    return true;
  } catch (error: any) {
    // Check if document already exists
    if (error.code === 409 || error.message?.toLowerCase().includes('already exists')) {
      await db.updateDocument(
        dbId,
        collectionId,
        documentId,
        documentData,
        permissions
      );
    }
    
    if (retryCount < maxRetries) {
      // Calculate exponential backoff: 1s, 2s, 4s
      const exponentialDelay = Math.min(1000 * Math.pow(2, retryCount), 8000);
      console.log(chalk.yellow(`Retrying document ${documentId} (attempt ${retryCount + 1}/${maxRetries}, backoff: ${exponentialDelay}ms)`));
      
      await delay(exponentialDelay);
      
      return await transferDocumentWithRetry(
        db,
        dbId,
        collectionId,
        documentId,
        documentData,
        permissions,
        maxRetries,
        retryCount + 1
      );
    }
    
    console.log(chalk.red(`Failed to transfer document ${documentId} after ${maxRetries} retries: ${error.message}`));
    return false;
  }
};

/**
 * Check if endpoint supports bulk operations (cloud.appwrite.io)
 */
const supportsBulkOperations = (endpoint: string): boolean => {
  return endpoint.includes('cloud.appwrite.io');
};

/**
 * Direct HTTP implementation of bulk upsert API
 */
const bulkUpsertDocuments = async (
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[]
): Promise<any> => {
  const apiPath = `/databases/${dbId}/collections/${collectionId}/documents`;
  const url = new URL(client.config.endpoint + apiPath);
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': client.config.project,
    'X-Appwrite-Key': client.config.key
  };
  
  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ documents })
  });
  
  if (!response.ok) {
    const errorData: any = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Bulk upsert failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
  }
  
  return await response.json();
};

/**
 * Direct HTTP implementation of bulk create API
 */
const bulkCreateDocuments = async (
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[]
): Promise<any> => {
  const apiPath = `/databases/${dbId}/collections/${collectionId}/documents`;
  const url = new URL(client.config.endpoint + apiPath);
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': client.config.project,
    'X-Appwrite-Key': client.config.key
  };
  
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ documents })
  });
  
  if (!response.ok) {
    const errorData: any = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Bulk create failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
  }
  
  return await response.json();
};

/**
 * Enhanced bulk document creation using direct HTTP calls
 */
const transferDocumentsBulkUpsert = async (
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[],
  maxBatchSize: number = 1000
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;
  
  // Prepare documents for bulk upsert
  const preparedDocs = documents.map(doc => {
    const toCreateObject: any = { ...doc };
    delete toCreateObject.$databaseId;
    delete toCreateObject.$collectionId;
    delete toCreateObject.$createdAt;
    delete toCreateObject.$updatedAt;
    
    // Keep $id and $permissions for upsert functionality
    return toCreateObject;
  });
  
  // Process in batches based on plan limits
  const documentBatches = chunk(preparedDocs, maxBatchSize);
  
  for (const batch of documentBatches) {
    console.log(chalk.blue(`Bulk upserting ${batch.length} documents...`));
    
    try {
      // Try bulk upsert with direct HTTP call
      const result = await bulkUpsertDocuments(client, dbId, collectionId, batch);
      successful += result.documents?.length || batch.length;
      console.log(chalk.green(`✅ Bulk upserted ${result.documents?.length || batch.length} documents`));
      
    } catch (error: any) {
      console.log(chalk.yellow(`Bulk upsert failed, trying smaller batch size...`));
      
      // If bulk upsert fails, try with smaller batch size (Pro plan limit)
      if (maxBatchSize > 100) {
        const smallerBatches = chunk(batch, 100);
        
        for (const smallBatch of smallerBatches) {
          try {
            const result = await bulkUpsertDocuments(client, dbId, collectionId, smallBatch);
            successful += result.documents?.length || smallBatch.length;
            console.log(chalk.green(`✅ Bulk upserted ${result.documents?.length || smallBatch.length} documents (smaller batch)`));
          } catch (smallBatchError: any) {
            console.log(chalk.yellow(`Smaller batch failed, falling back to individual transfers...`));
            
            // Fall back to individual document transfer for this batch
            const db = new Databases(client);
            const { successful: indivSuccessful, failed: indivFailed } = await transferDocumentBatchWithRetryFallback(
              db, dbId, collectionId, smallBatch.map((doc, index) => ({
                ...doc,
                $id: documents[documentBatches.indexOf(batch) * maxBatchSize + smallerBatches.indexOf(smallBatch) * 100 + index]?.$id || ID.unique(),
                $permissions: documents[documentBatches.indexOf(batch) * maxBatchSize + smallerBatches.indexOf(smallBatch) * 100 + index]?.$permissions || []
              }))
            );
            successful += indivSuccessful;
            failed += indivFailed;
          }
          
          // Add delay between batches
          await delay(200);
        }
      } else {
        // Fall back to individual document transfer
        const db = new Databases(client);
        const { successful: indivSuccessful, failed: indivFailed } = await transferDocumentBatchWithRetryFallback(
          db, dbId, collectionId, batch.map((doc, index) => ({
            ...doc,
            $id: documents[documentBatches.indexOf(batch) * maxBatchSize + index]?.$id || ID.unique(),
            $permissions: documents[documentBatches.indexOf(batch) * maxBatchSize + index]?.$permissions || []
          }))
        );
        successful += indivSuccessful;
        failed += indivFailed;
      }
    }
    
    // Add delay between major batches
    if (documentBatches.indexOf(batch) < documentBatches.length - 1) {
      await delay(500);
    }
  }
  
  return { successful, failed };
};

/**
 * Fallback batch document transfer with individual retry logic
 */
const transferDocumentBatchWithRetryFallback = async (
  db: Databases,
  dbId: string,
  collectionId: string,
  documents: any[],
  batchSize: number = 10
): Promise<{ successful: number; failed: number }> => {
  let successful = 0;
  let failed = 0;
  
  // Process documents in smaller batches to avoid overwhelming the server
  const documentBatches = chunk(documents, batchSize);
  
  for (const batch of documentBatches) {
    console.log(chalk.blue(`Processing batch of ${batch.length} documents...`));
    
    const batchPromises = batch.map(async (doc) => {
      const toCreateObject: Partial<typeof doc> = { ...doc };
      delete toCreateObject.$databaseId;
      delete toCreateObject.$collectionId;
      delete toCreateObject.$createdAt;
      delete toCreateObject.$updatedAt;
      delete toCreateObject.$id;
      delete toCreateObject.$permissions;
      
      const result = await transferDocumentWithRetry(
        db,
        dbId,
        collectionId,
        doc.$id,
        toCreateObject,
        doc.$permissions || []
      );
      
      return { docId: doc.$id, success: result };
    });
    
    const results = await Promise.allSettled(batchPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successful++;
        } else {
          failed++;
        }
      } else {
        console.log(chalk.red(`Batch promise rejected for document ${batch[index].$id}: ${result.reason}`));
        failed++;
      }
    });
    
    // Add delay between batches to avoid rate limiting
    if (documentBatches.indexOf(batch) < documentBatches.length - 1) {
      await delay(500);
    }
  }
  
  return { successful, failed };
};

/**
 * Enhanced batch document transfer with fault tolerance and bulk API support
 */
const transferDocumentBatchWithRetry = async (
  db: Databases,
  client: any,
  dbId: string,
  collectionId: string,
  documents: any[],
  batchSize: number = 10
): Promise<{ successful: number; failed: number }> => {
  // Check if we can use bulk operations
  if (supportsBulkOperations(client.config.endpoint)) {
    console.log(chalk.green(`🚀 Using bulk upsert API for faster document transfer`));
    
    // Try with Scale plan limit first (2500), then Pro (1000), then Free (100)
    const batchSizes = [1000, 100]; // Start with Pro plan, fallback to Free
    
    for (const maxBatchSize of batchSizes) {
      try {
        return await transferDocumentsBulkUpsert(client, dbId, collectionId, documents, maxBatchSize);
      } catch (error: any) {
        console.log(chalk.yellow(`Bulk upsert with batch size ${maxBatchSize} failed, trying smaller size...`));
        continue;
      }
    }
    
    // If all bulk operations fail, fall back to individual transfers
    console.log(chalk.yellow(`All bulk operations failed, falling back to individual document transfers`));
  }
  
  // Fall back to individual document transfer
  return await transferDocumentBatchWithRetryFallback(db, dbId, collectionId, documents, batchSize);
};

export const transferDocumentsBetweenDbsLocalToRemote = async (
  localDb: Databases,
  endpoint: string,
  projectId: string,
  apiKey: string,
  fromDbId: string,
  toDbId: string,
  fromCollId: string,
  toCollId: string
) => {
  console.log(chalk.blue(`Starting enhanced document transfer from ${fromCollId} to ${toCollId}...`));
  
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  
  const remoteDb = new Databases(client);
  let totalDocumentsProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  
  // Fetch documents in larger batches (1000 at a time)
  let hasMoreDocuments = true;
  let lastDocumentId: string | undefined;
  
  while (hasMoreDocuments) {
    const queries = [Query.limit(1000)]; // Fetch 1000 documents at a time
    if (lastDocumentId) {
      queries.push(Query.cursorAfter(lastDocumentId));
    }
    
    const fromCollDocs = await tryAwaitWithRetry(async () =>
      localDb.listDocuments(fromDbId, fromCollId, queries)
    );
    
    if (fromCollDocs.documents.length === 0) {
      hasMoreDocuments = false;
      break;
    }
    
    console.log(chalk.blue(`Fetched ${fromCollDocs.documents.length} documents, processing for transfer...`));
    
    const { successful, failed } = await transferDocumentBatchWithRetry(
      remoteDb,
      client,
      toDbId,
      toCollId,
      fromCollDocs.documents
    );
    
    totalDocumentsProcessed += fromCollDocs.documents.length;
    totalSuccessful += successful;
    totalFailed += failed;
    
    // Check if we have more documents to process
    if (fromCollDocs.documents.length < 1000) {
      hasMoreDocuments = false;
    } else {
      lastDocumentId = fromCollDocs.documents[fromCollDocs.documents.length - 1].$id;
    }
    
    console.log(chalk.gray(`Batch complete: ${successful} successful, ${failed} failed`));
  }
  
  if (totalDocumentsProcessed === 0) {
    MessageFormatter.info(`No documents found in collection ${fromCollId}`, { prefix: "Transfer" });
    return;
  }
  
  const message = `Total documents processed: ${totalDocumentsProcessed}, successful: ${totalSuccessful}, failed: ${totalFailed}`;
  
  if (totalFailed > 0) {
    MessageFormatter.warning(message, { prefix: "Transfer" });
  } else {
    MessageFormatter.success(message, { prefix: "Transfer" });
  }
};
