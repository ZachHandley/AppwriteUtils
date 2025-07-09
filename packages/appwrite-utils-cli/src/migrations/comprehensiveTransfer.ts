import { converterFunctions, tryAwaitWithRetry, parseAttribute } from "appwrite-utils";
import {
  Client,
  Databases,
  Storage,
  Users,
  Functions,
  type Models,
  Query,
} from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { MessageFormatter } from "../shared/messageFormatter.js";
import { ProgressManager } from "../shared/progressManager.js";
import { getClient } from "../utils/getClientFromConfig.js";
import { 
  transferDatabaseLocalToLocal, 
  transferDatabaseLocalToRemote,
  transferStorageLocalToLocal,
  transferStorageLocalToRemote,
  transferUsersLocalToRemote
} from "./transfer.js";
import { 
  deployLocalFunction 
} from "../functions/deployments.js";
import { listFunctions, downloadLatestFunctionDeployment } from "../functions/methods.js";
import pLimit from "p-limit";
import chalk from "chalk";
import { join } from "node:path";
import fs from "node:fs";

export interface ComprehensiveTransferOptions {
  sourceEndpoint: string;
  sourceProject: string;
  sourceKey: string;
  targetEndpoint: string;
  targetProject: string;
  targetKey: string;
  transferUsers?: boolean;
  transferDatabases?: boolean;
  transferBuckets?: boolean;
  transferFunctions?: boolean;
  concurrencyLimit?: number; // 5-100 in steps of 5
  dryRun?: boolean;
}

export interface TransferResults {
  users: { transferred: number; skipped: number; failed: number };
  databases: { transferred: number; skipped: number; failed: number };
  buckets: { transferred: number; skipped: number; failed: number };
  functions: { transferred: number; skipped: number; failed: number };
  totalTime: number;
}

export class ComprehensiveTransfer {
  private sourceClient: Client;
  private targetClient: Client;
  private sourceUsers: Users;
  private targetUsers: Users;
  private sourceDatabases: Databases;
  private targetDatabases: Databases;
  private sourceStorage: Storage;
  private targetStorage: Storage;
  private sourceFunctions: Functions;
  private targetFunctions: Functions;
  private limit: ReturnType<typeof pLimit>;
  private userLimit: ReturnType<typeof pLimit>;
  private fileLimit: ReturnType<typeof pLimit>;
  private results: TransferResults;
  private startTime: number;
  private tempDir: string;

  constructor(private options: ComprehensiveTransferOptions) {
    this.sourceClient = getClient(
      options.sourceEndpoint,
      options.sourceProject,
      options.sourceKey
    );
    this.targetClient = getClient(
      options.targetEndpoint,
      options.targetProject,
      options.targetKey
    );

    this.sourceUsers = new Users(this.sourceClient);
    this.targetUsers = new Users(this.targetClient);
    this.sourceDatabases = new Databases(this.sourceClient);
    this.targetDatabases = new Databases(this.targetClient);
    this.sourceStorage = new Storage(this.sourceClient);
    this.targetStorage = new Storage(this.targetClient);
    this.sourceFunctions = new Functions(this.sourceClient);
    this.targetFunctions = new Functions(this.targetClient);

    const baseLimit = options.concurrencyLimit || 10;
    this.limit = pLimit(baseLimit);
    
    // Different rate limits for different operations to prevent API throttling
    // Users: Half speed (more sensitive operations)
    // Files: Quarter speed (most bandwidth intensive)
    this.userLimit = pLimit(Math.max(1, Math.floor(baseLimit / 2)));
    this.fileLimit = pLimit(Math.max(1, Math.floor(baseLimit / 4)));
    this.results = {
      users: { transferred: 0, skipped: 0, failed: 0 },
      databases: { transferred: 0, skipped: 0, failed: 0 },
      buckets: { transferred: 0, skipped: 0, failed: 0 },
      functions: { transferred: 0, skipped: 0, failed: 0 },
      totalTime: 0,
    };
    this.startTime = Date.now();
    this.tempDir = join(process.cwd(), ".appwrite-transfer-temp");
  }

  async execute(): Promise<TransferResults> {
    try {
      MessageFormatter.info("Starting comprehensive transfer", { prefix: "Transfer" });
      
      if (this.options.dryRun) {
        MessageFormatter.info("DRY RUN MODE - No actual changes will be made", { prefix: "Transfer" });
      }

      // Show rate limiting configuration
      const baseLimit = this.options.concurrencyLimit || 10;
      const userLimit = Math.max(1, Math.floor(baseLimit / 2));
      const fileLimit = Math.max(1, Math.floor(baseLimit / 4));
      
      MessageFormatter.info(`Rate limits: General=${baseLimit}, Users=${userLimit}, Files=${fileLimit}`, { prefix: "Transfer" });

      // Ensure temp directory exists
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }

      // Execute transfers in the correct order
      if (this.options.transferUsers !== false) {
        await this.transferAllUsers();
      }

      if (this.options.transferDatabases !== false) {
        await this.transferAllDatabases();
      }

      if (this.options.transferBuckets !== false) {
        await this.transferAllBuckets();
      }

      if (this.options.transferFunctions !== false) {
        await this.transferAllFunctions();
      }

      this.results.totalTime = Date.now() - this.startTime;
      this.printSummary();

      return this.results;
    } catch (error) {
      MessageFormatter.error("Comprehensive transfer failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
      throw error;
    } finally {
      // Clean up temp directory
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    }
  }

  private async transferAllUsers(): Promise<void> {
    MessageFormatter.info("Starting user transfer phase", { prefix: "Transfer" });

    if (this.options.dryRun) {
      const usersList = await this.sourceUsers.list([Query.limit(1)]);
      MessageFormatter.info(`DRY RUN: Would transfer ${usersList.total} users`, { prefix: "Transfer" });
      return;
    }

    try {
      // Use the existing user transfer function
      // Note: The rate limiting is handled at the API level, not per-user
      // since user operations are already sequential in the existing implementation
      await transferUsersLocalToRemote(
        this.sourceUsers,
        this.options.targetEndpoint,
        this.options.targetProject,
        this.options.targetKey
      );
      
      // Get actual count for results
      const usersList = await this.sourceUsers.list([Query.limit(1)]);
      this.results.users.transferred = usersList.total;
      
      MessageFormatter.success(`User transfer completed`, { prefix: "Transfer" });
    } catch (error) {
      MessageFormatter.error("User transfer failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
      this.results.users.failed = 1;
    }
  }

  private async transferAllDatabases(): Promise<void> {
    MessageFormatter.info("Starting database transfer phase", { prefix: "Transfer" });

    try {
      const sourceDatabases = await this.sourceDatabases.list();
      const targetDatabases = await this.targetDatabases.list();

      if (this.options.dryRun) {
        MessageFormatter.info(`DRY RUN: Would transfer ${sourceDatabases.databases.length} databases`, { prefix: "Transfer" });
        return;
      }

      // Phase 1: Create all databases and collections (structure only)
      MessageFormatter.info("Phase 1: Creating database structures (databases, collections, attributes, indexes)", { prefix: "Transfer" });
      
      const structureCreationTasks = sourceDatabases.databases.map(db => 
        this.limit(async () => {
          try {
            // Check if database exists in target
            const existingDb = targetDatabases.databases.find(tdb => tdb.$id === db.$id);
            
            if (!existingDb) {
              // Create database in target
              await this.targetDatabases.create(db.$id, db.name, db.enabled);
              MessageFormatter.success(`Created database: ${db.name}`, { prefix: "Transfer" });
            }

            // Create collections, attributes, and indexes WITHOUT transferring documents
            await this.createDatabaseStructure(db.$id);

            MessageFormatter.success(`Database structure created: ${db.name}`, { prefix: "Transfer" });
          } catch (error) {
            MessageFormatter.error(`Database structure creation failed for ${db.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
            this.results.databases.failed++;
          }
        })
      );

      await Promise.all(structureCreationTasks);

      // Phase 2: Transfer all documents after all structures are created
      MessageFormatter.info("Phase 2: Transferring documents to all collections", { prefix: "Transfer" });
      
      const documentTransferTasks = sourceDatabases.databases.map(db => 
        this.limit(async () => {
          try {
            // Transfer documents for this database
            await this.transferDatabaseDocuments(db.$id);

            this.results.databases.transferred++;
            MessageFormatter.success(`Database documents transferred: ${db.name}`, { prefix: "Transfer" });
          } catch (error) {
            MessageFormatter.error(`Document transfer failed for ${db.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
            this.results.databases.failed++;
          }
        })
      );

      await Promise.all(documentTransferTasks);
      MessageFormatter.success("Database transfer phase completed", { prefix: "Transfer" });
    } catch (error) {
      MessageFormatter.error("Database transfer phase failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
    }
  }

  /**
   * Phase 1: Create database structure (collections, attributes, indexes) without transferring documents
   */
  private async createDatabaseStructure(dbId: string): Promise<void> {
    MessageFormatter.info(`Creating database structure for ${dbId}`, { prefix: "Transfer" });

    try {
      // Get all collections from source database
      const sourceCollections = await this.fetchAllCollections(dbId, this.sourceDatabases);
      MessageFormatter.info(`Found ${sourceCollections.length} collections in source database ${dbId}`, { prefix: "Transfer" });

      // Process each collection
      for (const collection of sourceCollections) {
        MessageFormatter.info(`Processing collection: ${collection.name} (${collection.$id})`, { prefix: "Transfer" });

        try {
          // Create or update collection in target
          let targetCollection: Models.Collection;
          const existingCollection = await tryAwaitWithRetry(async () =>
            this.targetDatabases.listCollections(dbId, [Query.equal("$id", collection.$id)])
          );

          if (existingCollection.collections.length > 0) {
            targetCollection = existingCollection.collections[0];
            MessageFormatter.info(`Collection ${collection.name} exists in target database`, { prefix: "Transfer" });

            // Update collection if needed
            if (
              targetCollection.name !== collection.name ||
              JSON.stringify(targetCollection.$permissions) !== JSON.stringify(collection.$permissions) ||
              targetCollection.documentSecurity !== collection.documentSecurity ||
              targetCollection.enabled !== collection.enabled
            ) {
              targetCollection = await tryAwaitWithRetry(async () =>
                this.targetDatabases.updateCollection(
                  dbId,
                  collection.$id,
                  collection.name,
                  collection.$permissions,
                  collection.documentSecurity,
                  collection.enabled
                )
              );
              MessageFormatter.success(`Collection ${collection.name} updated`, { prefix: "Transfer" });
            }
          } else {
            MessageFormatter.info(`Creating collection ${collection.name} in target database...`, { prefix: "Transfer" });
            targetCollection = await tryAwaitWithRetry(async () =>
              this.targetDatabases.createCollection(
                dbId,
                collection.$id,
                collection.name,
                collection.$permissions,
                collection.documentSecurity,
                collection.enabled
              )
            );
            MessageFormatter.success(`Collection ${collection.name} created`, { prefix: "Transfer" });
          }

          // Handle attributes with enhanced status checking
          MessageFormatter.info(`Creating attributes for collection ${collection.name} with enhanced monitoring...`, { prefix: "Transfer" });
          
          const attributesToCreate = collection.attributes.map(attr => parseAttribute(attr as any));
          
          const attributesSuccess = await this.createCollectionAttributesWithStatusCheck(
            this.targetDatabases,
            dbId,
            targetCollection,
            attributesToCreate
          );
          
          if (!attributesSuccess) {
            MessageFormatter.error(`Failed to create some attributes for collection ${collection.name}`, undefined, { prefix: "Transfer" });
            MessageFormatter.error(`Skipping index creation and document transfer for collection ${collection.name} due to attribute failures`, undefined, { prefix: "Transfer" });
            // Skip indexes and document transfer if attributes failed
            continue;
          } else {
            MessageFormatter.success(`All attributes created successfully for collection ${collection.name}`, { prefix: "Transfer" });
          }

          // Handle indexes with enhanced status checking
          MessageFormatter.info(`Creating indexes for collection ${collection.name} with enhanced monitoring...`, { prefix: "Transfer" });
          
          const indexesSuccess = await this.createCollectionIndexesWithStatusCheck(
            dbId,
            this.targetDatabases,
            targetCollection.$id,
            targetCollection,
            collection.indexes as any
          );
          
          if (!indexesSuccess) {
            MessageFormatter.error(`Failed to create some indexes for collection ${collection.name}`, undefined, { prefix: "Transfer" });
            MessageFormatter.warning(`Proceeding with document transfer despite index failures for collection ${collection.name}`, { prefix: "Transfer" });
          } else {
            MessageFormatter.success(`All indexes created successfully for collection ${collection.name}`, { prefix: "Transfer" });
          }

          MessageFormatter.success(`Structure complete for collection ${collection.name}`, { prefix: "Transfer" });
        } catch (error) {
          MessageFormatter.error(`Error processing collection ${collection.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
        }
      }
    } catch (error) {
      MessageFormatter.error(`Failed to create database structure for ${dbId}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
      throw error;
    }
  }

  /**
   * Phase 2: Transfer documents to all collections in the database
   */
  private async transferDatabaseDocuments(dbId: string): Promise<void> {
    MessageFormatter.info(`Transferring documents for database ${dbId}`, { prefix: "Transfer" });

    try {
      // Get all collections from source database
      const sourceCollections = await this.fetchAllCollections(dbId, this.sourceDatabases);
      MessageFormatter.info(`Transferring documents for ${sourceCollections.length} collections in database ${dbId}`, { prefix: "Transfer" });

      // Process each collection
      for (const collection of sourceCollections) {
        MessageFormatter.info(`Transferring documents for collection: ${collection.name} (${collection.$id})`, { prefix: "Transfer" });

        try {
          // Transfer documents
          await this.transferDocumentsBetweenDatabases(
            this.sourceDatabases,
            this.targetDatabases,
            dbId,
            dbId,
            collection.$id,
            collection.$id
          );
          
          MessageFormatter.success(`Documents transferred for collection ${collection.name}`, { prefix: "Transfer" });
        } catch (error) {
          MessageFormatter.error(`Error transferring documents for collection ${collection.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
        }
      }
    } catch (error) {
      MessageFormatter.error(`Failed to transfer documents for database ${dbId}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
      throw error;
    }
  }

  private async transferAllBuckets(): Promise<void> {
    MessageFormatter.info("Starting bucket transfer phase", { prefix: "Transfer" });

    try {
      const sourceBuckets = await this.sourceStorage.listBuckets();
      const targetBuckets = await this.targetStorage.listBuckets();

      if (this.options.dryRun) {
        let totalFiles = 0;
        for (const bucket of sourceBuckets.buckets) {
          const files = await this.sourceStorage.listFiles(bucket.$id, [Query.limit(1)]);
          totalFiles += files.total;
        }
        MessageFormatter.info(`DRY RUN: Would transfer ${sourceBuckets.buckets.length} buckets with ${totalFiles} files`, { prefix: "Transfer" });
        return;
      }

      const transferTasks = sourceBuckets.buckets.map(bucket => 
        this.limit(async () => {
          try {
            // Check if bucket exists in target
            const existingBucket = targetBuckets.buckets.find(tb => tb.$id === bucket.$id);
            
            if (!existingBucket) {
              // Create bucket in target
              await this.targetStorage.createBucket(
                bucket.$id,
                bucket.name,
                bucket.$permissions,
                bucket.fileSecurity,
                bucket.enabled,
                bucket.maximumFileSize,
                bucket.allowedFileExtensions,
                bucket.compression as any,
                bucket.encryption,
                bucket.antivirus
              );
              MessageFormatter.success(`Created bucket: ${bucket.name}`, { prefix: "Transfer" });
            }

            // Transfer bucket files with enhanced validation
            await this.transferBucketFiles(bucket.$id, bucket.$id);

            this.results.buckets.transferred++;
            MessageFormatter.success(`Bucket ${bucket.name} transferred successfully`, { prefix: "Transfer" });
          } catch (error) {
            MessageFormatter.error(`Bucket ${bucket.name} transfer failed`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
            this.results.buckets.failed++;
          }
        })
      );

      await Promise.all(transferTasks);
      MessageFormatter.success("Bucket transfer phase completed", { prefix: "Transfer" });
    } catch (error) {
      MessageFormatter.error("Bucket transfer phase failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
    }
  }

  private async transferBucketFiles(sourceBucketId: string, targetBucketId: string): Promise<void> {
    let lastFileId: string | undefined;
    let transferredFiles = 0;

    while (true) {
      const queries = [Query.limit(50)]; // Smaller batch size for better rate limiting
      if (lastFileId) {
        queries.push(Query.cursorAfter(lastFileId));
      }

      const files = await this.sourceStorage.listFiles(sourceBucketId, queries);
      if (files.files.length === 0) break;

      // Process files with rate limiting
      const fileTasks = files.files.map(file => 
        this.fileLimit(async () => {
          try {
            // Check if file already exists
            try {
              await this.targetStorage.getFile(targetBucketId, file.$id);
              MessageFormatter.info(`File ${file.name} already exists, skipping`, { prefix: "Transfer" });
              return;
            } catch (error) {
              // File doesn't exist, proceed with transfer
            }

            // Download file with validation
            const fileData = await this.validateAndDownloadFile(sourceBucketId, file.$id);
            if (!fileData) {
              MessageFormatter.warning(`File ${file.name} failed validation, skipping`, { prefix: "Transfer" });
              return;
            }

            // Upload file to target
            const fileToCreate = InputFile.fromBuffer(
              new Uint8Array(fileData),
              file.name
            );

            await this.targetStorage.createFile(
              targetBucketId,
              file.$id,
              fileToCreate,
              file.$permissions
            );

            transferredFiles++;
            MessageFormatter.success(`Transferred file: ${file.name}`, { prefix: "Transfer" });
          } catch (error) {
            MessageFormatter.error(`Failed to transfer file ${file.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
          }
        })
      );

      await Promise.all(fileTasks);

      if (files.files.length < 50) break;
      lastFileId = files.files[files.files.length - 1].$id;
    }

    MessageFormatter.info(`Transferred ${transferredFiles} files from bucket ${sourceBucketId}`, { prefix: "Transfer" });
  }

  private async validateAndDownloadFile(bucketId: string, fileId: string): Promise<ArrayBuffer | null> {
    let attempts = 3;
    while (attempts > 0) {
      try {
        const fileData = await this.sourceStorage.getFileDownload(bucketId, fileId);
        
        // Basic validation - ensure file is not empty and not too large
        if (fileData.byteLength === 0) {
          MessageFormatter.warning(`File ${fileId} is empty`, { prefix: "Transfer" });
          return null;
        }

        if (fileData.byteLength > 50 * 1024 * 1024) { // 50MB limit
          MessageFormatter.warning(`File ${fileId} is too large (${fileData.byteLength} bytes)`, { prefix: "Transfer" });
          return null;
        }

        return fileData;
      } catch (error) {
        attempts--;
        MessageFormatter.warning(`Error downloading file ${fileId}, attempts left: ${attempts}`, { prefix: "Transfer" });
        if (attempts === 0) {
          MessageFormatter.error(`Failed to download file ${fileId} after all attempts`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
          return null;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - attempts)));
      }
    }
    return null;
  }

  private async transferAllFunctions(): Promise<void> {
    MessageFormatter.info("Starting function transfer phase", { prefix: "Transfer" });

    try {
      const sourceFunctions = await listFunctions(this.sourceClient, [Query.limit(1000)]);
      const targetFunctions = await listFunctions(this.targetClient, [Query.limit(1000)]);

      if (this.options.dryRun) {
        MessageFormatter.info(`DRY RUN: Would transfer ${sourceFunctions.functions.length} functions`, { prefix: "Transfer" });
        return;
      }

      const transferTasks = sourceFunctions.functions.map(func => 
        this.limit(async () => {
          try {
            // Check if function exists in target
            const existingFunc = targetFunctions.functions.find(tf => tf.$id === func.$id);
            
            if (existingFunc) {
              MessageFormatter.info(`Function ${func.name} already exists, skipping creation`, { prefix: "Transfer" });
              this.results.functions.skipped++;
              return;
            }

            // Download function from source
            const functionPath = await this.downloadFunction(func);
            if (!functionPath) {
              MessageFormatter.error(`Failed to download function ${func.name}`, undefined, { prefix: "Transfer" });
              this.results.functions.failed++;
              return;
            }

            // Deploy function to target
            const functionConfig = {
              $id: func.$id,
              name: func.name,
              runtime: func.runtime as any,
              execute: func.execute,
              events: func.events,
              enabled: func.enabled,
              logging: func.logging,
              entrypoint: func.entrypoint,
              commands: func.commands,
              scopes: func.scopes as any,
              timeout: func.timeout,
              schedule: func.schedule,
              installationId: func.installationId,
              providerRepositoryId: func.providerRepositoryId,
              providerBranch: func.providerBranch,
              providerSilentMode: func.providerSilentMode,
              providerRootDirectory: func.providerRootDirectory,
              specification: func.specification as any,
              dirPath: functionPath,
            };
            
            await deployLocalFunction(this.targetClient, func.name, functionConfig);

            this.results.functions.transferred++;
            MessageFormatter.success(`Function ${func.name} transferred successfully`, { prefix: "Transfer" });
          } catch (error) {
            MessageFormatter.error(`Function ${func.name} transfer failed`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
            this.results.functions.failed++;
          }
        })
      );

      await Promise.all(transferTasks);
      MessageFormatter.success("Function transfer phase completed", { prefix: "Transfer" });
    } catch (error) {
      MessageFormatter.error("Function transfer phase failed", error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
    }
  }

  private async downloadFunction(func: Models.Function): Promise<string | null> {
    try {
      const { path } = await downloadLatestFunctionDeployment(
        this.sourceClient,
        func.$id,
        this.tempDir
      );
      return path;
    } catch (error) {
      MessageFormatter.error(`Failed to download function ${func.name}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
      return null;
    }
  }

  /**
   * Helper method to fetch all collections from a database
   */
  private async fetchAllCollections(dbId: string, databases: Databases): Promise<Models.Collection[]> {
    const collections: Models.Collection[] = [];
    let lastId: string | undefined;

    while (true) {
      const queries = [Query.limit(100)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const result = await tryAwaitWithRetry(async () => databases.listCollections(dbId, queries));
      
      if (result.collections.length === 0) {
        break;
      }

      collections.push(...result.collections);
      
      if (result.collections.length < 100) {
        break;
      }
      
      lastId = result.collections[result.collections.length - 1].$id;
    }

    return collections;
  }

  /**
   * Helper method to parse attribute objects (simplified version of parseAttribute)
   */
  private parseAttribute(attr: any): any {
    // This is a simplified version - in production you'd use the actual parseAttribute from appwrite-utils
    return {
      key: attr.key,
      type: attr.type,
      size: attr.size,
      required: attr.required,
      array: attr.array,
      default: attr.default,
      format: attr.format,
      elements: attr.elements,
      min: attr.min,
      max: attr.max,
      relatedCollection: attr.relatedCollection,
      relationType: attr.relationType,
      twoWay: attr.twoWay,
      twoWayKey: attr.twoWayKey,
      onDelete: attr.onDelete,
      side: attr.side
    };
  }

  /**
   * Helper method to create collection attributes with status checking
   */
  private async createCollectionAttributesWithStatusCheck(
    databases: Databases,
    dbId: string,
    collection: Models.Collection,
    attributes: any[]
  ): Promise<boolean> {
    // Import the enhanced attribute creation function
    const { createUpdateCollectionAttributesWithStatusCheck } = await import("../collections/attributes.js");
    
    return await createUpdateCollectionAttributesWithStatusCheck(
      databases,
      dbId,
      collection,
      attributes
    );
  }

  /**
   * Helper method to create collection indexes with status checking
   */
  private async createCollectionIndexesWithStatusCheck(
    dbId: string,
    databases: Databases,
    collectionId: string,
    collection: Models.Collection,
    indexes: any[]
  ): Promise<boolean> {
    // Import the enhanced index creation function
    const { createOrUpdateIndexesWithStatusCheck } = await import("../collections/indexes.js");
    
    return await createOrUpdateIndexesWithStatusCheck(
      dbId,
      databases,
      collectionId,
      collection,
      indexes
    );
  }

  /**
   * Helper method to transfer documents between databases
   */
  private async transferDocumentsBetweenDatabases(
    sourceDb: Databases,
    targetDb: Databases,
    sourceDbId: string,
    targetDbId: string,
    sourceCollectionId: string,
    targetCollectionId: string
  ): Promise<void> {
    MessageFormatter.info(`Transferring documents from ${sourceCollectionId} to ${targetCollectionId}`, { prefix: "Transfer" });

    let lastId: string | undefined;
    let totalTransferred = 0;

    while (true) {
      const queries = [Query.limit(50)]; // Smaller batch size for better performance
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const documents = await tryAwaitWithRetry(async () => 
        sourceDb.listDocuments(sourceDbId, sourceCollectionId, queries)
      );

      if (documents.documents.length === 0) {
        break;
      }

      // Transfer documents with rate limiting
      const transferTasks = documents.documents.map(doc => 
        this.limit(async () => {
          try {
            // Check if document already exists
            try {
              await targetDb.getDocument(targetDbId, targetCollectionId, doc.$id);
              MessageFormatter.info(`Document ${doc.$id} already exists, skipping`, { prefix: "Transfer" });
              return;
            } catch (error) {
              // Document doesn't exist, proceed with creation
            }

            // Create document in target
            const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...docData } = doc;
            
            await tryAwaitWithRetry(async () =>
              targetDb.createDocument(
                targetDbId,
                targetCollectionId,
                doc.$id,
                docData,
                doc.$permissions
              )
            );

            totalTransferred++;
            MessageFormatter.success(`Transferred document ${doc.$id}`, { prefix: "Transfer" });
          } catch (error) {
            MessageFormatter.error(`Failed to transfer document ${doc.$id}`, error instanceof Error ? error : new Error(String(error)), { prefix: "Transfer" });
          }
        })
      );

      await Promise.all(transferTasks);

      if (documents.documents.length < 50) {
        break;
      }

      lastId = documents.documents[documents.documents.length - 1].$id;
    }

    MessageFormatter.info(`Transferred ${totalTransferred} documents from ${sourceCollectionId} to ${targetCollectionId}`, { prefix: "Transfer" });
  }

  private printSummary(): void {
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    
    MessageFormatter.info("=== COMPREHENSIVE TRANSFER SUMMARY ===", { prefix: "Transfer" });
    MessageFormatter.info(`Total Time: ${duration}s`, { prefix: "Transfer" });
    MessageFormatter.info(`Users: ${this.results.users.transferred} transferred, ${this.results.users.skipped} skipped, ${this.results.users.failed} failed`, { prefix: "Transfer" });
    MessageFormatter.info(`Databases: ${this.results.databases.transferred} transferred, ${this.results.databases.skipped} skipped, ${this.results.databases.failed} failed`, { prefix: "Transfer" });
    MessageFormatter.info(`Buckets: ${this.results.buckets.transferred} transferred, ${this.results.buckets.skipped} skipped, ${this.results.buckets.failed} failed`, { prefix: "Transfer" });
    MessageFormatter.info(`Functions: ${this.results.functions.transferred} transferred, ${this.results.functions.skipped} skipped, ${this.results.functions.failed} failed`, { prefix: "Transfer" });
    
    const totalTransferred = this.results.users.transferred + this.results.databases.transferred + this.results.buckets.transferred + this.results.functions.transferred;
    const totalFailed = this.results.users.failed + this.results.databases.failed + this.results.buckets.failed + this.results.functions.failed;
    
    if (totalFailed === 0) {
      MessageFormatter.success(`All ${totalTransferred} items transferred successfully!`, { prefix: "Transfer" });
    } else {
      MessageFormatter.warning(`${totalTransferred} items transferred, ${totalFailed} failed`, { prefix: "Transfer" });
    }
  }
}