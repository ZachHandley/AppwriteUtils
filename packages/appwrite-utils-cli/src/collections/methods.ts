import {
  Databases,
  ID,
  Permission,
  Query,
  type Models,
} from "node-appwrite";
import type { AppwriteConfig, CollectionCreate, Indexes, Attribute } from "appwrite-utils";
import type { DatabaseAdapter } from "appwrite-utils-helpers";
import { getAdapterFromConfig } from "appwrite-utils-helpers";
import {
  nameToIdMapping,
  processQueue,
  queuedOperations,
  clearProcessingState,
  isCollectionProcessed,
  markCollectionProcessed,
  enqueueOperation
} from "../shared/operationQueue.js";
import { logger, SchemaGenerator } from "appwrite-utils-helpers";
// Legacy attribute/index helpers removed in favor of unified adapter path
import {
  isNull,
  isUndefined,
  isNil,
  isPlainObject,
  isString,
} from "es-toolkit";
import { delay, tryAwaitWithRetry } from "appwrite-utils-helpers";
import { MessageFormatter, mapToCreateAttributeParams, mapToUpdateAttributeParams } from "appwrite-utils-helpers";
import { isLegacyDatabases } from "appwrite-utils-helpers";
import { diffTableColumns, isIndexEqualToIndex, diffColumnsDetailed, executeColumnOperations } from "./tableOperations.js";
import { createOrUpdateIndexesViaAdapter, deleteObsoleteIndexesViaAdapter } from "../tables/indexManager.js";

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
      // Return remote collection for update operations (don't merge local config over it)
      return items[0] as Models.Collection;
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
  await schemaGenerator.generateSchemas();
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

  // Always use adapter path (LegacyAdapter translates when pre-1.8)
  const { adapter } = await getAdapterFromConfig(config);
  await createOrUpdateCollectionsViaAdapter(
    adapter,
    databaseId,
    config,
    deletedCollections,
    selectedCollections
  );
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

  // Helpers for attribute operations through adapter
  const createAttr = async (tableId: string, attr: Attribute) => {
    const params = mapToCreateAttributeParams(attr as any, { databaseId, tableId });
    await adapter.createAttribute(params);
    await delay(150);
  };
  const updateAttr = async (tableId: string, attr: Attribute) => {
    const params = mapToUpdateAttributeParams(attr as any, { databaseId, tableId }) as any;
    await adapter.updateAttribute(params);
    await delay(150);
  };

  // Local queue for unresolved relationships
  const relQueue: { tableId: string; attr: Attribute }[] = [];

  for (const collection of collectionsToProcess) {
    const { attributes, indexes, ...collectionData } = collection as any;

    // Check if this table has already been processed in this session (per database)
    if (collectionData.$id && isCollectionProcessed(collectionData.$id, databaseId)) {
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

    // Find existing table — prefer lookup by ID (if provided), then by name
    let table: any | undefined;
    let tableId: string;

    // 1) Try by explicit $id first (handles rename scenarios)
    if (collectionData.$id) {
      try {
        const byId = await adapter.getTable({ databaseId, tableId: collectionData.$id });
        table = (byId as any).data || (byId as any).tables?.[0];
        if (table?.$id) {
          MessageFormatter.info(`Found existing table by ID: ${table.$id}`, { prefix: 'Tables' });
        }
      } catch {
        // Not found by ID; fall back to name lookup
      }
    }

    // 2) If not found by ID, try by name
    if (!table) {
      const list = await adapter.listTables({ databaseId, queries: [Query.equal('name', collectionData.name)] });
      const items: any[] = (list as any).tables || [];
      table = items[0];
      if (table?.$id) {
        // If local has $id that differs from remote, prefer remote (IDs are immutable)
        if (collectionData.$id && collectionData.$id !== table.$id) {
          MessageFormatter.warning(`Config $id '${collectionData.$id}' differs from existing table ID '${table.$id}'. Using existing table.`, { prefix: 'Tables' });
        }
      }
    }

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

    // Create/Update attributes: non-relationship first using enhanced planning
    const nonRel = (attributes || []).filter((a: Attribute) => a.type !== 'relationship');
    if (nonRel.length > 0) {
      // Fetch existing columns once
      const tableInfo = await adapter.getTable({ databaseId, tableId });
      const existingCols: any[] = (tableInfo as any).data?.columns || (tableInfo as any).data?.attributes || [];

      // Plan with icons
      const plan = diffColumnsDetailed(nonRel as any, existingCols);
      const plus = plan.toCreate.map((a: any) => a.key);
      const plusminus = plan.toUpdate.map((u: any) => (u.attribute as any).key);
      const minus = plan.toRecreate.map((r: any) => (r.newAttribute as any).key);
      const skip = plan.unchanged;

      // Compute deletions (remote extras not present locally)
      const desiredKeysForDelete = new Set((attributes || []).map((a: any) => a.key));
      const extraRemoteKeys = (existingCols || [])
        .map((c: any) => c?.key)
        .filter((k: any): k is string => !!k && !desiredKeysForDelete.has(k));

      const parts: string[] = [];
      if (plus.length) parts.push(`➕  ${plus.length} (${plus.join(', ')})`);
      if (plusminus.length) parts.push(`🔧  ${plusminus.length} (${plusminus.join(', ')})`);
      if (minus.length) parts.push(`♻️  ${minus.length} (${minus.join(', ')})`);
      if (skip.length) parts.push(`⏭️  ${skip.length}`);
      parts.push(`🗑️  ${extraRemoteKeys.length}${extraRemoteKeys.length ? ` (${extraRemoteKeys.join(', ')})` : ''}`);
      MessageFormatter.info(`Plan → ${parts.join('  |  ') || 'no changes'}`, { prefix: 'Attributes' });

      // Execute
      const colResults = await executeColumnOperations(adapter, databaseId, tableId, plan);

      if (colResults.success.length > 0) {
        MessageFormatter.success(`Processed ${colResults.success.length} ops`, { prefix: 'Attributes' });
      }
      if (colResults.errors.length > 0) {
        MessageFormatter.error(`${colResults.errors.length} attribute operations failed:`, undefined, { prefix: 'Attributes' });
        for (const err of colResults.errors) {
          MessageFormatter.error(`  ${err.column}: ${err.error}`, undefined, { prefix: 'Attributes' });
        }
      }
      MessageFormatter.info(
        `Summary → ➕  ${plan.toCreate.length}  |  🔧  ${plan.toUpdate.length}  |  ♻️  ${plan.toRecreate.length}  |  ⏭️  ${plan.unchanged.length}`,
        { prefix: 'Attributes' }
      );
    }

    // Relationship attributes — resolve relatedCollection to ID, then diff and create/update with recreate support
    const relsAll = (attributes || []).filter((a: Attribute) => a.type === 'relationship') as any[];
    if (relsAll.length > 0) {
      const relsResolved: any[] = [];
      const relsDeferred: any[] = [];

      // Resolve related collections (names -> IDs) using cache or lookup.
      // If not resolvable yet (target table created later in the same push), queue for later.
      for (const attr of relsAll) {
        const relNameOrId = attr.relatedCollection as string | undefined;
        if (!relNameOrId) continue;
        let relId = nameToIdMapping.get(relNameOrId) || relNameOrId;
        let resolved = false;
        if (nameToIdMapping.has(relNameOrId)) {
          resolved = true;
        } else {
          // Try resolve by name
          try {
            const relList = await adapter.listTables({ databaseId, queries: [Query.equal('name', relNameOrId)] });
            const relItems: any[] = (relList as any).tables || [];
            if (relItems[0]?.$id) {
              relId = relItems[0].$id;
              nameToIdMapping.set(relNameOrId, relId);
              resolved = true;
            }
          } catch {}

          // If the relNameOrId looks like an ID but isn't resolved yet, attempt a direct get
          if (!resolved && relNameOrId && relNameOrId.length >= 10) {
            try {
              const probe = await adapter.getTable({ databaseId, tableId: relNameOrId });
              if ((probe as any).data?.$id) {
                nameToIdMapping.set(relNameOrId, relNameOrId);
                relId = relNameOrId;
                resolved = true;
              }
            } catch {}
          }
        }

        if (resolved && relId && typeof relId === 'string') {
          attr.relatedCollection = relId;
          relsResolved.push(attr);
        } else {
          // Defer until related table exists; queue a surgical operation
          enqueueOperation({
            type: 'attribute',
            collectionId: tableId,
            attribute: attr,
            dependencies: [relNameOrId]
          });
          relsDeferred.push(attr);
        }
      }

      // Compute a detailed plan for immediately resolvable relationships
      const tableInfo2 = await adapter.getTable({ databaseId, tableId });
      const existingCols2: any[] = (tableInfo2 as any).data?.columns || (tableInfo2 as any).data?.attributes || [];
      const relPlan = diffColumnsDetailed(relsResolved as any, existingCols2);

      // Relationship plan with icons (includes recreates)
      {
        const parts: string[] = [];
        if (relPlan.toCreate.length) parts.push(`➕  ${relPlan.toCreate.length} (${relPlan.toCreate.map((a:any)=>a.key).join(', ')})`);
        if (relPlan.toUpdate.length) parts.push(`🔧  ${relPlan.toUpdate.length} (${relPlan.toUpdate.map((u:any)=>u.attribute?.key ?? u.key).join(', ')})`);
        if (relPlan.toRecreate.length) parts.push(`♻️  ${relPlan.toRecreate.length} (${relPlan.toRecreate.map((r:any)=>r.newAttribute?.key ?? r?.key).join(', ')})`);
        if (relPlan.unchanged.length) parts.push(`⏭️  ${relPlan.unchanged.length}`);
        MessageFormatter.info(`Plan → ${parts.join('  |  ') || 'no changes'}`, { prefix: 'Relationships' });
      }

      // Execute plan using the same operation executor to properly handle deletes/recreates
      const relResults = await executeColumnOperations(adapter, databaseId, tableId, relPlan);
      if (relResults.success.length > 0) {
        const totalRelationships = relPlan.toCreate.length + relPlan.toUpdate.length + relPlan.toRecreate.length + relPlan.unchanged.length;
        const activeRelationships = relPlan.toCreate.length + relPlan.toUpdate.length + relPlan.toRecreate.length;

        if (relResults.success.length !== activeRelationships) {
          // Show both counts when they differ (usually due to recreations)
          MessageFormatter.success(`Processed ${relResults.success.length} operations for ${activeRelationships} relationship${activeRelationships === 1 ? '' : 's'}`, { prefix: 'Relationships' });
        } else {
          MessageFormatter.success(`Processed ${relResults.success.length} relationship${relResults.success.length === 1 ? '' : 's'}`, { prefix: 'Relationships' });
        }
      }
      if (relResults.errors.length > 0) {
        MessageFormatter.error(`${relResults.errors.length} relationship operations failed:`, undefined, { prefix: 'Relationships' });
        for (const err of relResults.errors) {
          MessageFormatter.error(`  ${err.column}: ${err.error}`, undefined, { prefix: 'Relationships' });
        }
      }

      if (relsDeferred.length > 0) {
        MessageFormatter.info(`Deferred ${relsDeferred.length} relationship(s) until related tables become available`, { prefix: 'Relationships' });
      }
    }

    // Wait for all attributes to become available before creating indexes
    const allAttrKeys = [
      ...nonRel.map((a: any) => a.key),
      ...relsAll.filter((a: any) => a.relatedCollection).map((a: any) => a.key)
    ];

    if (allAttrKeys.length > 0) {
      for (const attrKey of allAttrKeys) {
        const maxWait = 60000; // 60 seconds
        const startTime = Date.now();
        let lastStatus = '';

        while (Date.now() - startTime < maxWait) {
          try {
            const tableData = await adapter.getTable({ databaseId, tableId });
            const attrs = (tableData as any).data?.columns || (tableData as any).data?.attributes || [];
            const attr = attrs.find((a: any) => a.key === attrKey);

            if (attr) {
              if (attr.status === 'available') {
                break; // Attribute is ready
              }
              if (attr.status === 'failed' || attr.status === 'stuck') {
                throw new Error(`Attribute ${attrKey} failed to create: ${attr.error || 'unknown error'}`);
              }
              // Still processing, continue waiting
              lastStatus = attr.status;
            }

            await delay(2000); // Check every 2 seconds
          } catch (e) {
            // If we can't check status, assume it's processing and continue
            await delay(2000);
          }
        }

        // Timeout check
        if (Date.now() - startTime >= maxWait) {
          MessageFormatter.warning(
            `Attribute ${attrKey} did not become available within ${maxWait / 1000}s (last status: ${lastStatus}). Proceeding anyway.`,
            { prefix: 'Attributes' }
          );
        }
      }
    }

    // Index management: create/update indexes using clean adapter-based system
    const localTableConfig = config.collections?.find(
      c => c.name === collectionData.name || c.$id === collectionData.$id
    );
    const idxs = (localTableConfig?.indexes ?? indexes ?? []) as any[];

    // Create/update indexes with proper planning and execution
    await createOrUpdateIndexesViaAdapter(adapter, databaseId, tableId, idxs, indexes);

    // Handle obsolete index deletions
    const desiredIndexKeys: Set<string> = new Set((indexes || []).map((i: any) => i.key as string));
    await deleteObsoleteIndexesViaAdapter(adapter, databaseId, tableId, desiredIndexKeys);

    // Deletions: remove columns/attributes that are present remotely but not in desired config
    try {
      const desiredKeys = new Set((attributes || []).map((a: any) => a.key));
      const tableInfo3 = await adapter.getTable({ databaseId, tableId });
      const existingCols3: any[] = (tableInfo3 as any).data?.columns || (tableInfo3 as any).data?.attributes || [];
      const toDelete = existingCols3
        .filter((col: any) => {
          if (!col?.key || desiredKeys.has(col.key)) return false;
          // Don't delete child-side relationship attributes - they're auto-managed by Appwrite
          // for two-way relationships and deleting them would break the parent relationship
          if (col.type === 'relationship' && col.side === 'child') return false;
          return true;
        })
        .map((col: any) => col.key as string);

      if (toDelete.length > 0) {
        MessageFormatter.info(`Plan → 🗑️  ${toDelete.length} (${toDelete.join(', ')})`, { prefix: 'Attributes' });
        const deleted: string[] = [];
        const errors: Array<{ key: string; error: string }> = [];
        for (const key of toDelete) {
          try {
            // Drop any indexes that reference this attribute to avoid server errors
            try {
              const idxRes = await adapter.listIndexes({ databaseId, tableId });
              const ilist: any[] = (idxRes as any).data || (idxRes as any).indexes || [];
              for (const idx of ilist) {
                const attrs: string[] = Array.isArray(idx.attributes)
                  ? idx.attributes
                  : (Array.isArray((idx as any).columns) ? (idx as any).columns : []);
                if (attrs.includes(key)) {
                  MessageFormatter.info(`🗑️  Deleting index '${idx.key}' referencing '${key}'`, { prefix: 'Indexes' });
                  await adapter.deleteIndex({ databaseId, tableId, key: idx.key });
                  await delay(500);
                }
              }
            } catch {}

            await adapter.deleteAttribute({ databaseId, tableId, key });
            // Wait briefly for deletion to settle
            const start = Date.now();
            const maxWaitMs = 60000;
            while (Date.now() - start < maxWaitMs) {
              try {
                const tinfo = await adapter.getTable({ databaseId, tableId });
                const cols = (tinfo as any).data?.columns || (tinfo as any).data?.attributes || [];
                const found = cols.find((c: any) => c.key === key);
                if (!found) break;
                if (found.status && found.status !== 'deleting') break;
              } catch {}
              await delay(1000);
            }
            deleted.push(key);
          } catch (e: any) {
            errors.push({ key, error: e?.message || String(e) });
          }
        }
        if (deleted.length) {
          MessageFormatter.success(`Deleted ${deleted.length} attributes: ${deleted.join(', ')}`, { prefix: 'Attributes' });
        }
        if (errors.length) {
          MessageFormatter.error(`${errors.length} deletions failed`, undefined, { prefix: 'Attributes' });
          errors.forEach(er => MessageFormatter.error(`  ${er.key}: ${er.error}`, undefined, { prefix: 'Attributes' }));
        }
      } else {
        MessageFormatter.info(`Plan → 🗑️  0`, { prefix: 'Attributes' });
      }
    } catch (e) {
      MessageFormatter.warning(`Could not evaluate deletions: ${(e as Error)?.message || e}`, { prefix: 'Attributes' });
    }

    // Mark this table as fully processed for this database to prevent re-processing in the same DB only
    markCollectionProcessed(tableId, collectionData.name, databaseId);
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

  // Process any remaining queued operations to complete relationship sync
  try {
    MessageFormatter.info(`🔄 Processing final operation queue for database ${databaseId}`, { prefix: "Tables" });
    await processQueue(adapter, databaseId);
    MessageFormatter.info(`✅ Operation queue processing completed`, { prefix: "Tables" });
  } catch (error) {
    MessageFormatter.error(`Failed to process operation queue`, error instanceof Error ? error : new Error(String(error)), { prefix: 'Tables' });
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
