import {
  converterFunctions,
  tryAwaitWithRetry,
  parseAttribute,
  objectNeedsUpdate,
} from "appwrite-utils";
import {
  Client,
  Databases,
  Storage,
  Users,
  Functions,
  Teams,
  type Models,
  Query,
  AppwriteException,
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
  transferUsersLocalToRemote,
} from "./transfer.js";
import { deployLocalFunction } from "../functions/deployments.js";
import {
  listFunctions,
  downloadLatestFunctionDeployment,
} from "../functions/methods.js";
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
  transferTeams?: boolean;
  transferDatabases?: boolean;
  transferBuckets?: boolean;
  transferFunctions?: boolean;
  concurrencyLimit?: number; // 5-100 in steps of 5
  dryRun?: boolean;
}

export interface TransferResults {
  users: { transferred: number; skipped: number; failed: number };
  teams: { transferred: number; skipped: number; failed: number };
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
  private sourceTeams: Teams;
  private targetTeams: Teams;
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
  private cachedMaxFileSize?: number; // Cache successful maximumFileSize for subsequent buckets

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
    this.sourceTeams = new Teams(this.sourceClient);
    this.targetTeams = new Teams(this.targetClient);
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
      teams: { transferred: 0, skipped: 0, failed: 0 },
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
      MessageFormatter.info("Starting comprehensive transfer", {
        prefix: "Transfer",
      });

      if (this.options.dryRun) {
        MessageFormatter.info("DRY RUN MODE - No actual changes will be made", {
          prefix: "Transfer",
        });
      }

      // Show rate limiting configuration
      const baseLimit = this.options.concurrencyLimit || 10;
      const userLimit = Math.max(1, Math.floor(baseLimit / 2));
      const fileLimit = Math.max(1, Math.floor(baseLimit / 4));

      MessageFormatter.info(
        `Rate limits: General=${baseLimit}, Users=${userLimit}, Files=${fileLimit}`,
        { prefix: "Transfer" }
      );

      // Ensure temp directory exists
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }

      // Execute transfers in the correct order
      if (this.options.transferUsers !== false) {
        await this.transferAllUsers();
      }

      if (this.options.transferTeams !== false) {
        await this.transferAllTeams();
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
      MessageFormatter.error(
        "Comprehensive transfer failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
      throw error;
    } finally {
      // Clean up temp directory
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    }
  }

  private async transferAllUsers(): Promise<void> {
    MessageFormatter.info("Starting user transfer phase", {
      prefix: "Transfer",
    });

    if (this.options.dryRun) {
      const usersList = await this.sourceUsers.list([Query.limit(1)]);
      MessageFormatter.info(
        `DRY RUN: Would transfer ${usersList.total} users`,
        { prefix: "Transfer" }
      );
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

      MessageFormatter.success(`User transfer completed`, {
        prefix: "Transfer",
      });
    } catch (error) {
      MessageFormatter.error(
        "User transfer failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
      this.results.users.failed = 1;
    }
  }

  private async transferAllTeams(): Promise<void> {
    MessageFormatter.info("Starting team transfer phase", {
      prefix: "Transfer",
    });

    try {
      // Fetch all teams from source with pagination
      const allSourceTeams = await this.fetchAllTeams(this.sourceTeams);
      const allTargetTeams = await this.fetchAllTeams(this.targetTeams);

      if (this.options.dryRun) {
        let totalMemberships = 0;
        for (const team of allSourceTeams) {
          const memberships = await this.sourceTeams.listMemberships(team.$id, [
            Query.limit(1),
          ]);
          totalMemberships += memberships.total;
        }
        MessageFormatter.info(
          `DRY RUN: Would transfer ${allSourceTeams.length} teams with ${totalMemberships} memberships`,
          { prefix: "Transfer" }
        );
        return;
      }

      const transferTasks = allSourceTeams.map((team) =>
        this.limit(async () => {
          try {
            // Check if team exists in target
            const existingTeam = allTargetTeams.find(
              (tt) => tt.$id === team.$id
            );

            if (!existingTeam) {
              // Fetch all memberships to extract unique roles before creating team
              MessageFormatter.info(
                `Fetching memberships for team ${team.name} to extract roles`,
                { prefix: "Transfer" }
              );
              const memberships = await this.fetchAllMemberships(team.$id);

              // Extract unique roles from all memberships
              const allRoles = new Set<string>();
              memberships.forEach((membership) => {
                membership.roles.forEach((role) => allRoles.add(role));
              });
              const uniqueRoles = Array.from(allRoles);

              MessageFormatter.info(
                `Found ${uniqueRoles.length} unique roles for team ${
                  team.name
                }: ${uniqueRoles.join(", ")}`,
                { prefix: "Transfer" }
              );

              // Create team in target with the collected roles
              await this.targetTeams.create(team.$id, team.name, uniqueRoles);
              MessageFormatter.success(
                `Created team: ${team.name} with roles: ${uniqueRoles.join(
                  ", "
                )}`,
                { prefix: "Transfer" }
              );
            } else {
              MessageFormatter.info(
                `Team ${team.name} already exists, updating if needed`,
                { prefix: "Transfer" }
              );

              // Update team if needed
              if (existingTeam.name !== team.name) {
                await this.targetTeams.updateName(team.$id, team.name);
                MessageFormatter.success(`Updated team name: ${team.name}`, {
                  prefix: "Transfer",
                });
              }
            }

            // Transfer team memberships
            await this.transferTeamMemberships(team.$id);

            this.results.teams.transferred++;
            MessageFormatter.success(
              `Team ${team.name} transferred successfully`,
              { prefix: "Transfer" }
            );
          } catch (error) {
            MessageFormatter.error(
              `Team ${team.name} transfer failed`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
            this.results.teams.failed++;
          }
        })
      );

      await Promise.all(transferTasks);
      MessageFormatter.success("Team transfer phase completed", {
        prefix: "Transfer",
      });
    } catch (error) {
      MessageFormatter.error(
        "Team transfer phase failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
    }
  }

  private async transferAllDatabases(): Promise<void> {
    MessageFormatter.info("Starting database transfer phase", {
      prefix: "Transfer",
    });

    try {
      const sourceDatabases = await this.sourceDatabases.list();
      const targetDatabases = await this.targetDatabases.list();

      if (this.options.dryRun) {
        MessageFormatter.info(
          `DRY RUN: Would transfer ${sourceDatabases.databases.length} databases`,
          { prefix: "Transfer" }
        );
        return;
      }

      // Phase 1: Create all databases and collections (structure only)
      MessageFormatter.info(
        "Phase 1: Creating database structures (databases, collections, attributes, indexes)",
        { prefix: "Transfer" }
      );

      const structureCreationTasks = sourceDatabases.databases.map((db) =>
        this.limit(async () => {
          try {
            // Check if database exists in target
            const existingDb = targetDatabases.databases.find(
              (tdb) => tdb.$id === db.$id
            );

            if (!existingDb) {
              // Create database in target
              await this.targetDatabases.create(db.$id, db.name, db.enabled);
              MessageFormatter.success(`Created database: ${db.name}`, {
                prefix: "Transfer",
              });
            }

            // Create collections, attributes, and indexes WITHOUT transferring documents
            await this.createDatabaseStructure(db.$id);

            MessageFormatter.success(`Database structure created: ${db.name}`, {
              prefix: "Transfer",
            });
          } catch (error) {
            MessageFormatter.error(
              `Database structure creation failed for ${db.name}`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
            this.results.databases.failed++;
          }
        })
      );

      await Promise.all(structureCreationTasks);

      // Phase 2: Transfer all documents after all structures are created
      MessageFormatter.info(
        "Phase 2: Transferring documents to all collections",
        { prefix: "Transfer" }
      );

      const documentTransferTasks = sourceDatabases.databases.map((db) =>
        this.limit(async () => {
          try {
            // Transfer documents for this database
            await this.transferDatabaseDocuments(db.$id);

            this.results.databases.transferred++;
            MessageFormatter.success(
              `Database documents transferred: ${db.name}`,
              { prefix: "Transfer" }
            );
          } catch (error) {
            MessageFormatter.error(
              `Document transfer failed for ${db.name}`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
            this.results.databases.failed++;
          }
        })
      );

      await Promise.all(documentTransferTasks);
      MessageFormatter.success("Database transfer phase completed", {
        prefix: "Transfer",
      });
    } catch (error) {
      MessageFormatter.error(
        "Database transfer phase failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
    }
  }

  /**
   * Phase 1: Create database structure (collections, attributes, indexes) without transferring documents
   */
  private async createDatabaseStructure(dbId: string): Promise<void> {
    MessageFormatter.info(`Creating database structure for ${dbId}`, {
      prefix: "Transfer",
    });

    try {
      // Get all collections from source database
      const sourceCollections = await this.fetchAllCollections(
        dbId,
        this.sourceDatabases
      );
      MessageFormatter.info(
        `Found ${sourceCollections.length} collections in source database ${dbId}`,
        { prefix: "Transfer" }
      );

      // Process each collection
      for (const collection of sourceCollections) {
        MessageFormatter.info(
          `Processing collection: ${collection.name} (${collection.$id})`,
          { prefix: "Transfer" }
        );

        try {
          // Create or update collection in target
          let targetCollection: Models.Collection;
          const existingCollection = await tryAwaitWithRetry(async () =>
            this.targetDatabases.listCollections(dbId, [
              Query.equal("$id", collection.$id),
            ])
          );

          if (existingCollection.collections.length > 0) {
            targetCollection = existingCollection.collections[0];
            MessageFormatter.info(
              `Collection ${collection.name} exists in target database`,
              { prefix: "Transfer" }
            );

            // Update collection if needed
            if (
              targetCollection.name !== collection.name ||
              JSON.stringify(targetCollection.$permissions) !==
                JSON.stringify(collection.$permissions) ||
              targetCollection.documentSecurity !==
                collection.documentSecurity ||
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
              MessageFormatter.success(
                `Collection ${collection.name} updated`,
                { prefix: "Transfer" }
              );
            }
          } else {
            MessageFormatter.info(
              `Creating collection ${collection.name} in target database...`,
              { prefix: "Transfer" }
            );
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
            MessageFormatter.success(`Collection ${collection.name} created`, {
              prefix: "Transfer",
            });
          }

          // Handle attributes with enhanced status checking
          MessageFormatter.info(
            `Creating attributes for collection ${collection.name} with enhanced monitoring...`,
            { prefix: "Transfer" }
          );

          const attributesToCreate = collection.attributes.map((attr) =>
            parseAttribute(attr as any)
          );

          const attributesSuccess =
            await this.createCollectionAttributesWithStatusCheck(
              this.targetDatabases,
              dbId,
              targetCollection,
              attributesToCreate
            );

          if (!attributesSuccess) {
            MessageFormatter.error(
              `Failed to create some attributes for collection ${collection.name}`,
              undefined,
              { prefix: "Transfer" }
            );
            MessageFormatter.error(
              `Skipping index creation and document transfer for collection ${collection.name} due to attribute failures`,
              undefined,
              { prefix: "Transfer" }
            );
            // Skip indexes and document transfer if attributes failed
            continue;
          } else {
            MessageFormatter.success(
              `All attributes created successfully for collection ${collection.name}`,
              { prefix: "Transfer" }
            );
          }

          // Handle indexes with enhanced status checking
          MessageFormatter.info(
            `Creating indexes for collection ${collection.name} with enhanced monitoring...`,
            { prefix: "Transfer" }
          );

          let indexesSuccess = true;
          // Check if indexes need to be created ahead of time
          if (
            collection.indexes.some(
              (index) =>
                !targetCollection.indexes.some(
                  (ti) =>
                    ti.key === index.key ||
                    ti.attributes.sort().join(",") ===
                      index.attributes.sort().join(",")
                )
            ) ||
            collection.indexes.length !== targetCollection.indexes.length
          ) {
            indexesSuccess = await this.createCollectionIndexesWithStatusCheck(
              dbId,
              this.targetDatabases,
              targetCollection.$id,
              targetCollection,
              collection.indexes as any
            );
          }

          if (!indexesSuccess) {
            MessageFormatter.error(
              `Failed to create some indexes for collection ${collection.name}`,
              undefined,
              { prefix: "Transfer" }
            );
            MessageFormatter.warning(
              `Proceeding with document transfer despite index failures for collection ${collection.name}`,
              { prefix: "Transfer" }
            );
          } else {
            MessageFormatter.success(
              `All indexes created successfully for collection ${collection.name}`,
              { prefix: "Transfer" }
            );
          }

          MessageFormatter.success(
            `Structure complete for collection ${collection.name}`,
            { prefix: "Transfer" }
          );
        } catch (error) {
          MessageFormatter.error(
            `Error processing collection ${collection.name}`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Transfer" }
          );
        }
      }
    } catch (error) {
      MessageFormatter.error(
        `Failed to create database structure for ${dbId}`,
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
      throw error;
    }
  }

  /**
   * Phase 2: Transfer documents to all collections in the database
   */
  private async transferDatabaseDocuments(dbId: string): Promise<void> {
    MessageFormatter.info(`Transferring documents for database ${dbId}`, {
      prefix: "Transfer",
    });

    try {
      // Get all collections from source database
      const sourceCollections = await this.fetchAllCollections(
        dbId,
        this.sourceDatabases
      );
      MessageFormatter.info(
        `Transferring documents for ${sourceCollections.length} collections in database ${dbId}`,
        { prefix: "Transfer" }
      );

      // Process each collection
      for (const collection of sourceCollections) {
        MessageFormatter.info(
          `Transferring documents for collection: ${collection.name} (${collection.$id})`,
          { prefix: "Transfer" }
        );

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

          MessageFormatter.success(
            `Documents transferred for collection ${collection.name}`,
            { prefix: "Transfer" }
          );
        } catch (error) {
          MessageFormatter.error(
            `Error transferring documents for collection ${collection.name}`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Transfer" }
          );
        }
      }
    } catch (error) {
      MessageFormatter.error(
        `Failed to transfer documents for database ${dbId}`,
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
      throw error;
    }
  }

  private async transferAllBuckets(): Promise<void> {
    MessageFormatter.info("Starting bucket transfer phase", {
      prefix: "Transfer",
    });

    try {
      // Get all buckets from source with pagination
      const allSourceBuckets = await this.fetchAllBuckets(this.sourceStorage);
      const allTargetBuckets = await this.fetchAllBuckets(this.targetStorage);

      if (this.options.dryRun) {
        let totalFiles = 0;
        for (const bucket of allSourceBuckets) {
          const files = await this.sourceStorage.listFiles(bucket.$id, [
            Query.limit(1),
          ]);
          totalFiles += files.total;
        }
        MessageFormatter.info(
          `DRY RUN: Would transfer ${allSourceBuckets.length} buckets with ${totalFiles} files`,
          { prefix: "Transfer" }
        );
        return;
      }

      const transferTasks = allSourceBuckets.map((bucket) =>
        this.limit(async () => {
          try {
            // Check if bucket exists in target
            const existingBucket = allTargetBuckets.find(
              (tb) => tb.$id === bucket.$id
            );

            if (!existingBucket) {
              // Create bucket with fallback strategy for maximumFileSize
              await this.createBucketWithFallback(bucket);
              MessageFormatter.success(`Created bucket: ${bucket.name}`, {
                prefix: "Transfer",
              });
            } else {
              // Compare bucket permissions and update if needed
              const sourcePermissions = JSON.stringify(
                bucket.$permissions?.sort() || []
              );
              const targetPermissions = JSON.stringify(
                existingBucket.$permissions?.sort() || []
              );

              if (
                sourcePermissions !== targetPermissions ||
                existingBucket.name !== bucket.name ||
                existingBucket.fileSecurity !== bucket.fileSecurity ||
                existingBucket.enabled !== bucket.enabled
              ) {
                MessageFormatter.warning(
                  `Bucket ${bucket.name} exists but has different settings. Updating to match source.`,
                  { prefix: "Transfer" }
                );

                try {
                  await this.targetStorage.updateBucket(
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
                  MessageFormatter.success(
                    `Updated bucket ${bucket.name} to match source`,
                    { prefix: "Transfer" }
                  );
                } catch (updateError) {
                  MessageFormatter.error(
                    `Failed to update bucket ${bucket.name}`,
                    updateError instanceof Error
                      ? updateError
                      : new Error(String(updateError)),
                    { prefix: "Transfer" }
                  );
                }
              } else {
                MessageFormatter.info(
                  `Bucket ${bucket.name} already exists with matching settings`,
                  { prefix: "Transfer" }
                );
              }
            }

            // Transfer bucket files with enhanced validation
            await this.transferBucketFiles(bucket.$id, bucket.$id);

            this.results.buckets.transferred++;
            MessageFormatter.success(
              `Bucket ${bucket.name} transferred successfully`,
              { prefix: "Transfer" }
            );
          } catch (error) {
            MessageFormatter.error(
              `Bucket ${bucket.name} transfer failed`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
            this.results.buckets.failed++;
          }
        })
      );

      await Promise.all(transferTasks);
      MessageFormatter.success("Bucket transfer phase completed", {
        prefix: "Transfer",
      });
    } catch (error) {
      MessageFormatter.error(
        "Bucket transfer phase failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
    }
  }

  private async createBucketWithFallback(bucket: Models.Bucket): Promise<void> {
    // Determine the optimal size to try first
    let sizeToTry: number;

    if (this.cachedMaxFileSize) {
      // Use cached size if it's smaller than or equal to the bucket's original size
      if (bucket.maximumFileSize >= this.cachedMaxFileSize) {
        sizeToTry = this.cachedMaxFileSize;
        MessageFormatter.info(
          `Bucket ${bucket.name}: Using cached maximumFileSize ${sizeToTry} (${(
            sizeToTry / 1_000_000_000
          ).toFixed(1)}GB)`,
          { prefix: "Transfer" }
        );
      } else {
        // Original size is smaller than cached size, try original first
        sizeToTry = bucket.maximumFileSize;
      }
    } else {
      // No cached size yet, try original size first
      sizeToTry = bucket.maximumFileSize;
    }

    // Try the optimal size first
    try {
      await this.targetStorage.createBucket(
        bucket.$id,
        bucket.name,
        bucket.$permissions,
        bucket.fileSecurity,
        bucket.enabled,
        sizeToTry,
        bucket.allowedFileExtensions,
        bucket.compression as any,
        bucket.encryption,
        bucket.antivirus
      );

      // Success - cache this size if it's not already cached or is smaller than cached
      if (!this.cachedMaxFileSize || sizeToTry < this.cachedMaxFileSize) {
        this.cachedMaxFileSize = sizeToTry;
        MessageFormatter.info(
          `Bucket ${
            bucket.name
          }: Cached successful maximumFileSize ${sizeToTry} (${(
            sizeToTry / 1_000_000_000
          ).toFixed(1)}GB)`,
          { prefix: "Transfer" }
        );
      }

      // Log if we used a different size than original
      if (sizeToTry !== bucket.maximumFileSize) {
        MessageFormatter.warning(
          `Bucket ${
            bucket.name
          }: maximumFileSize used ${sizeToTry} instead of original ${
            bucket.maximumFileSize
          } (${(sizeToTry / 1_000_000_000).toFixed(1)}GB)`,
          { prefix: "Transfer" }
        );
      }

      return; // Success, exit the function
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if the error is related to maximumFileSize validation
      if (
        err.message.includes("maximumFileSize") ||
        err.message.includes("valid range")
      ) {
        MessageFormatter.warning(
          `Bucket ${bucket.name}: Failed with maximumFileSize ${sizeToTry}, falling back to smaller sizes...`,
          { prefix: "Transfer" }
        );
        // Continue to fallback logic below
      } else {
        // Different error, don't retry
        throw err;
      }
    }

    // Fallback to progressively smaller sizes
    const fallbackSizes = [
      5_000_000_000, // 5GB
      2_500_000_000, // 2.5GB
      2_000_000_000, // 2GB
      1_000_000_000, // 1GB
      500_000_000, // 500MB
      100_000_000, // 100MB
    ];

    // Remove sizes that are larger than or equal to the already-tried size
    const validSizes = fallbackSizes
      .filter((size) => size < sizeToTry)
      .sort((a, b) => b - a); // Sort descending

    let lastError: Error | null = null;

    for (const fileSize of validSizes) {
      try {
        await this.targetStorage.createBucket(
          bucket.$id,
          bucket.name,
          bucket.$permissions,
          bucket.fileSecurity,
          bucket.enabled,
          fileSize,
          bucket.allowedFileExtensions,
          bucket.compression as any,
          bucket.encryption,
          bucket.antivirus
        );

        // Success - cache this size if it's not already cached or is smaller than cached
        if (!this.cachedMaxFileSize || fileSize < this.cachedMaxFileSize) {
          this.cachedMaxFileSize = fileSize;
          MessageFormatter.info(
            `Bucket ${
              bucket.name
            }: Cached successful maximumFileSize ${fileSize} (${(
              fileSize / 1_000_000_000
            ).toFixed(1)}GB)`,
            { prefix: "Transfer" }
          );
        }

        // Log if we had to reduce the file size
        if (fileSize !== bucket.maximumFileSize) {
          MessageFormatter.warning(
            `Bucket ${bucket.name}: maximumFileSize reduced from ${
              bucket.maximumFileSize
            } to ${fileSize} (${(fileSize / 1_000_000_000).toFixed(1)}GB)`,
            { prefix: "Transfer" }
          );
        }

        return; // Success, exit the function
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if the error is related to maximumFileSize validation
        if (
          lastError.message.includes("maximumFileSize") ||
          lastError.message.includes("valid range")
        ) {
          MessageFormatter.warning(
            `Bucket ${bucket.name}: Failed with maximumFileSize ${fileSize}, trying smaller size...`,
            { prefix: "Transfer" }
          );
          continue; // Try next smaller size
        } else {
          // Different error, don't retry
          throw lastError;
        }
      }
    }

    // If we get here, all fallback sizes failed
    MessageFormatter.error(
      `Bucket ${bucket.name}: All fallback file sizes failed. Last error: ${lastError?.message}`,
      lastError || undefined,
      { prefix: "Transfer" }
    );
    throw lastError || new Error("All fallback file sizes failed");
  }

  private async transferBucketFiles(
    sourceBucketId: string,
    targetBucketId: string
  ): Promise<void> {
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
      const fileTasks = files.files.map((file) =>
        this.fileLimit(async () => {
          try {
            // Check if file already exists and compare permissions
            let existingFile: Models.File | null = null;
            try {
              existingFile = await this.targetStorage.getFile(
                targetBucketId,
                file.$id
              );

              // Compare permissions between source and target file
              const sourcePermissions = JSON.stringify(
                file.$permissions?.sort() || []
              );
              const targetPermissions = JSON.stringify(
                existingFile.$permissions?.sort() || []
              );

              if (sourcePermissions !== targetPermissions) {
                MessageFormatter.warning(
                  `File ${file.name} (${file.$id}) exists but has different permissions. Source: ${sourcePermissions}, Target: ${targetPermissions}`,
                  { prefix: "Transfer" }
                );

                // Update file permissions to match source
                try {
                  await this.targetStorage.updateFile(
                    targetBucketId,
                    file.$id,
                    file.name,
                    file.$permissions
                  );
                  MessageFormatter.success(
                    `Updated file ${file.name} permissions to match source`,
                    { prefix: "Transfer" }
                  );
                } catch (updateError) {
                  MessageFormatter.error(
                    `Failed to update permissions for file ${file.name}`,
                    updateError instanceof Error
                      ? updateError
                      : new Error(String(updateError)),
                    { prefix: "Transfer" }
                  );
                }
              } else {
                MessageFormatter.info(
                  `File ${file.name} already exists with matching permissions, skipping`,
                  { prefix: "Transfer" }
                );
              }
              return;
            } catch (error) {
              // File doesn't exist, proceed with transfer
            }

            // Download file with validation
            const fileData = await this.validateAndDownloadFile(
              sourceBucketId,
              file.$id
            );
            if (!fileData) {
              MessageFormatter.warning(
                `File ${file.name} failed validation, skipping`,
                { prefix: "Transfer" }
              );
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
            MessageFormatter.success(`Transferred file: ${file.name}`, {
              prefix: "Transfer",
            });
          } catch (error) {
            MessageFormatter.error(
              `Failed to transfer file ${file.name}`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
          }
        })
      );

      await Promise.all(fileTasks);

      if (files.files.length < 50) break;
      lastFileId = files.files[files.files.length - 1].$id;
    }

    MessageFormatter.info(
      `Transferred ${transferredFiles} files from bucket ${sourceBucketId}`,
      { prefix: "Transfer" }
    );
  }

  private async validateAndDownloadFile(
    bucketId: string,
    fileId: string
  ): Promise<ArrayBuffer | null> {
    let attempts = 3;
    while (attempts > 0) {
      try {
        const fileData = await this.sourceStorage.getFileDownload(
          bucketId,
          fileId
        );

        // Basic validation - ensure file is not empty and not too large
        if (fileData.byteLength === 0) {
          MessageFormatter.warning(`File ${fileId} is empty`, {
            prefix: "Transfer",
          });
          return null;
        }

        if (fileData.byteLength > 50 * 1024 * 1024) {
          // 50MB limit
          MessageFormatter.warning(
            `File ${fileId} is too large (${fileData.byteLength} bytes)`,
            { prefix: "Transfer" }
          );
          return null;
        }

        return fileData;
      } catch (error) {
        attempts--;
        MessageFormatter.warning(
          `Error downloading file ${fileId}, attempts left: ${attempts}`,
          { prefix: "Transfer" }
        );
        if (attempts === 0) {
          MessageFormatter.error(
            `Failed to download file ${fileId} after all attempts`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Transfer" }
          );
          return null;
        }
        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (4 - attempts))
        );
      }
    }
    return null;
  }

  private async transferAllFunctions(): Promise<void> {
    MessageFormatter.info("Starting function transfer phase", {
      prefix: "Transfer",
    });

    try {
      const sourceFunctions = await listFunctions(this.sourceClient, [
        Query.limit(1000),
      ]);
      const targetFunctions = await listFunctions(this.targetClient, [
        Query.limit(1000),
      ]);

      if (this.options.dryRun) {
        MessageFormatter.info(
          `DRY RUN: Would transfer ${sourceFunctions.functions.length} functions`,
          { prefix: "Transfer" }
        );
        return;
      }

      const transferTasks = sourceFunctions.functions.map((func) =>
        this.limit(async () => {
          try {
            // Check if function exists in target
            const existingFunc = targetFunctions.functions.find(
              (tf) => tf.$id === func.$id
            );

            if (existingFunc) {
              MessageFormatter.info(
                `Function ${func.name} already exists, skipping creation`,
                { prefix: "Transfer" }
              );
              this.results.functions.skipped++;
              return;
            }

            // Download function from source
            const functionPath = await this.downloadFunction(func);
            if (!functionPath) {
              MessageFormatter.error(
                `Failed to download function ${func.name}`,
                undefined,
                { prefix: "Transfer" }
              );
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

            await deployLocalFunction(
              this.targetClient,
              func.name,
              functionConfig
            );

            this.results.functions.transferred++;
            MessageFormatter.success(
              `Function ${func.name} transferred successfully`,
              { prefix: "Transfer" }
            );
          } catch (error) {
            MessageFormatter.error(
              `Function ${func.name} transfer failed`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
            this.results.functions.failed++;
          }
        })
      );

      await Promise.all(transferTasks);
      MessageFormatter.success("Function transfer phase completed", {
        prefix: "Transfer",
      });
    } catch (error) {
      MessageFormatter.error(
        "Function transfer phase failed",
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
    }
  }

  private async downloadFunction(
    func: Models.Function
  ): Promise<string | null> {
    try {
      const { path } = await downloadLatestFunctionDeployment(
        this.sourceClient,
        func.$id,
        this.tempDir
      );
      return path;
    } catch (error) {
      MessageFormatter.error(
        `Failed to download function ${func.name}`,
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
      return null;
    }
  }

  /**
   * Helper method to fetch all collections from a database
   */
  private async fetchAllCollections(
    dbId: string,
    databases: Databases
  ): Promise<Models.Collection[]> {
    const collections: Models.Collection[] = [];
    let lastId: string | undefined;

    while (true) {
      const queries = [Query.limit(100)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const result = await tryAwaitWithRetry(async () =>
        databases.listCollections(dbId, queries)
      );

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
   * Helper method to fetch all buckets with pagination
   */
  private async fetchAllBuckets(storage: Storage): Promise<Models.Bucket[]> {
    const buckets: Models.Bucket[] = [];
    let lastId: string | undefined;

    while (true) {
      const queries = [Query.limit(100)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const result = await tryAwaitWithRetry(async () =>
        storage.listBuckets(queries)
      );

      if (result.buckets.length === 0) {
        break;
      }

      buckets.push(...result.buckets);

      if (result.buckets.length < 100) {
        break;
      }

      lastId = result.buckets[result.buckets.length - 1].$id;
    }

    return buckets;
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
      side: attr.side,
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
    const { createUpdateCollectionAttributesWithStatusCheck } = await import(
      "../collections/attributes.js"
    );

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
    const { createOrUpdateIndexesWithStatusCheck } = await import(
      "../collections/indexes.js"
    );

    return await createOrUpdateIndexesWithStatusCheck(
      dbId,
      databases,
      collectionId,
      collection,
      indexes
    );
  }

  /**
   * Helper method to transfer documents between databases using bulk operations with content and permission-based filtering
   */
  private async transferDocumentsBetweenDatabases(
    sourceDb: Databases,
    targetDb: Databases,
    sourceDbId: string,
    targetDbId: string,
    sourceCollectionId: string,
    targetCollectionId: string
  ): Promise<void> {
    MessageFormatter.info(
      `Transferring documents from ${sourceCollectionId} to ${targetCollectionId} with bulk operations, content comparison, and permission filtering`,
      { prefix: "Transfer" }
    );

    let lastId: string | undefined;
    let totalTransferred = 0;
    let totalSkipped = 0;
    let totalUpdated = 0;

    // Check if bulk operations are supported
    const bulkEnabled = false;
    // Temporarily disable to see if it fixes my permissions issues
    const supportsBulk = bulkEnabled ? this.options.targetEndpoint.includes("cloud.appwrite.io") : false;

    if (supportsBulk) {
      MessageFormatter.info(`Using bulk operations for enhanced performance`, {
        prefix: "Transfer",
      });
    }

    while (true) {
      // Fetch source documents in larger batches (1000 instead of 50)
      const queries = [Query.limit(1000)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const sourceDocuments = await tryAwaitWithRetry(async () =>
        sourceDb.listDocuments(sourceDbId, sourceCollectionId, queries)
      );

      if (sourceDocuments.documents.length === 0) {
        break;
      }

      MessageFormatter.info(
        `Processing batch of ${sourceDocuments.documents.length} source documents`,
        { prefix: "Transfer" }
      );

      // Extract document IDs from the current batch
      const sourceDocIds = sourceDocuments.documents.map((doc) => doc.$id);

      // Fetch existing documents from target in a single query
      const existingTargetDocs = await this.fetchTargetDocumentsBatch(
        targetDb,
        targetDbId,
        targetCollectionId,
        sourceDocIds
      );

      // Create a map for quick lookup of existing documents
      const existingDocsMap = new Map<string, Models.Document>();
      existingTargetDocs.forEach((doc) => {
        existingDocsMap.set(doc.$id, doc);
      });

      // Filter documents based on existence, content comparison, and permission comparison
      const documentsToTransfer: Models.Document[] = [];
      const documentsToUpdate: {
        doc: Models.Document;
        targetDoc: Models.Document;
        reason: string;
      }[] = [];

      for (const sourceDoc of sourceDocuments.documents) {
        const existingTargetDoc = existingDocsMap.get(sourceDoc.$id);

        if (!existingTargetDoc) {
          // Document doesn't exist in target, needs to be transferred
          documentsToTransfer.push(sourceDoc);
        } else {
          // Document exists, compare both content and permissions
          const sourcePermissions = Array.from(
            new Set(sourceDoc.$permissions || [])
          ).sort();
          const targetPermissions = Array.from(
            new Set(existingTargetDoc.$permissions || [])
          ).sort();
          const permissionsDiffer =
            sourcePermissions.join(",") !== targetPermissions.join(",") ||
            sourcePermissions.length !== targetPermissions.length;

          // Use objectNeedsUpdate to compare document content (excluding system fields)
          const contentDiffers = objectNeedsUpdate(
            existingTargetDoc,
            sourceDoc
          );

          if (contentDiffers && permissionsDiffer) {
            // Both content and permissions differ
            documentsToUpdate.push({
              doc: sourceDoc,
              targetDoc: existingTargetDoc,
              reason: "content and permissions differ",
            });
          } else if (contentDiffers) {
            // Only content differs
            documentsToUpdate.push({
              doc: sourceDoc,
              targetDoc: existingTargetDoc,
              reason: "content differs",
            });
          } else if (permissionsDiffer) {
            // Only permissions differ
            documentsToUpdate.push({
              doc: sourceDoc,
              targetDoc: existingTargetDoc,
              reason: "permissions differ",
            });
          } else {
            // Document exists with identical content AND permissions, skip
            totalSkipped++;
          }
        }
      }

      MessageFormatter.info(
        `Batch analysis: ${documentsToTransfer.length} to create, ${documentsToUpdate.length} to update, ${totalSkipped} skipped so far`,
        { prefix: "Transfer" }
      );

      // Process new documents with bulk operations if supported and available
      if (documentsToTransfer.length > 0) {
        if (supportsBulk && documentsToTransfer.length >= 10) {
          // Use bulk operations for large batches
          await this.transferDocumentsBulk(
            targetDb,
            targetDbId,
            targetCollectionId,
            documentsToTransfer
          );
          totalTransferred += documentsToTransfer.length;
        } else {
          // Use individual transfers for smaller batches or non-bulk endpoints
          const transferCount = await this.transferDocumentsIndividual(
            targetDb,
            targetDbId,
            targetCollectionId,
            documentsToTransfer
          );
          totalTransferred += transferCount;
        }
      }

      // Process document updates (always individual since bulk update with permissions needs special handling)
      if (documentsToUpdate.length > 0) {
        const updateCount = await this.updateDocumentsIndividual(
          targetDb,
          targetDbId,
          targetCollectionId,
          documentsToUpdate
        );
        totalUpdated += updateCount;
      }

      if (sourceDocuments.documents.length < 1000) {
        break;
      }

      lastId =
        sourceDocuments.documents[sourceDocuments.documents.length - 1].$id;
    }

    MessageFormatter.info(
      `Transfer complete: ${totalTransferred} new, ${totalUpdated} updated, ${totalSkipped} skipped from ${sourceCollectionId} to ${targetCollectionId}`,
      { prefix: "Transfer" }
    );
  }

  /**
   * Fetch target documents by IDs in batches to check existence and permissions
   */
  private async fetchTargetDocumentsBatch(
    targetDb: Databases,
    targetDbId: string,
    targetCollectionId: string,
    docIds: string[]
  ): Promise<Models.Document[]> {
    const documents: Models.Document[] = [];

    // Split IDs into chunks of 100 for Query.equal limitations
    const idChunks = this.chunkArray(docIds, 100);

    for (const chunk of idChunks) {
      try {
        const result = await tryAwaitWithRetry(async () =>
          targetDb.listDocuments(targetDbId, targetCollectionId, [
            Query.equal("$id", chunk),
            Query.limit(100),
          ])
        );
        documents.push(...result.documents);
      } catch (error) {
        // If query fails, fall back to individual gets (less efficient but more reliable)
        MessageFormatter.warning(
          `Batch query failed for ${chunk.length} documents, falling back to individual checks`,
          { prefix: "Transfer" }
        );

        for (const docId of chunk) {
          try {
            const doc = await targetDb.getDocument(
              targetDbId,
              targetCollectionId,
              docId
            );
            documents.push(doc);
          } catch (getError) {
            // Document doesn't exist, which is fine
          }
        }
      }
    }

    return documents;
  }

  /**
   * Transfer documents using bulk operations with proper batch size handling
   */
  private async transferDocumentsBulk(
    targetDb: Databases,
    targetDbId: string,
    targetCollectionId: string,
    documents: Models.Document[]
  ): Promise<void> {
    // Prepare documents for bulk upsert
    const preparedDocs = documents.map((doc) => {
      const {
        $id,
        $createdAt,
        $updatedAt,
        $permissions,
        $databaseId,
        $collectionId,
        $sequence,
        ...docData
      } = doc;
      return {
        $id,
        $permissions,
        ...docData,
      };
    });

    // Process in smaller chunks for bulk operations (1000 for Pro, 100 for Free tier)
    const batchSizes = [1000, 100]; // Start with Pro plan, fallback to Free
    let processed = false;

    for (const maxBatchSize of batchSizes) {
      const documentBatches = this.chunkArray(preparedDocs, maxBatchSize);

      try {
        for (const batch of documentBatches) {
          await this.bulkUpsertDocuments(
            this.targetClient,
            targetDbId,
            targetCollectionId,
            batch
          );

          MessageFormatter.success(
            `✅ Bulk upserted ${batch.length} documents`,
            { prefix: "Transfer" }
          );
        }

        processed = true;
        break; // Success, exit batch size loop
      } catch (error) {
        MessageFormatter.warning(
          `Bulk upsert with batch size ${maxBatchSize} failed, trying smaller size...`,
          { prefix: "Transfer" }
        );
        continue; // Try next smaller batch size
      }
    }

    if (!processed) {
      MessageFormatter.warning(
        `All bulk operations failed, falling back to individual transfers`,
        { prefix: "Transfer" }
      );

      // Fall back to individual transfers
      await this.transferDocumentsIndividual(
        targetDb,
        targetDbId,
        targetCollectionId,
        documents
      );
    }
  }

  /**
   * Direct HTTP implementation of bulk upsert API
   */
  private async bulkUpsertDocuments(
    client: any,
    dbId: string,
    collectionId: string,
    documents: any[]
  ): Promise<any> {
    const apiPath = `/databases/${dbId}/collections/${collectionId}/documents`;
    const url = new URL(client.config.endpoint + apiPath);

    const headers = {
      "Content-Type": "application/json",
      "X-Appwrite-Project": client.config.project,
      "X-Appwrite-Key": client.config.key,
    };

    const response = await fetch(url.toString(), {
      method: "PUT",
      headers,
      body: JSON.stringify({ documents }),
    });

    if (!response.ok) {
      const errorData: any = await response
        .json()
        .catch(() => ({ message: "Unknown error" }));
      throw new Error(
        `Bulk upsert failed: ${response.status} - ${
          errorData.message || "Unknown error"
        }`
      );
    }

    return await response.json();
  }

  /**
   * Transfer documents individually with rate limiting
   */
  private async transferDocumentsIndividual(
    targetDb: Databases,
    targetDbId: string,
    targetCollectionId: string,
    documents: Models.Document[]
  ): Promise<number> {
    let successCount = 0;

    const transferTasks = documents.map((doc) =>
      this.limit(async () => {
        try {
          const {
            $id,
            $createdAt,
            $updatedAt,
            $permissions,
            $databaseId,
            $collectionId,
            $sequence,
            ...docData
          } = doc;

          await tryAwaitWithRetry(async () =>
            targetDb.createDocument(
              targetDbId,
              targetCollectionId,
              doc.$id,
              docData,
              doc.$permissions
            )
          );

          successCount++;
        } catch (error) {
          if (
            error instanceof AppwriteException &&
            error.message.includes("already exists")
          ) {
            try {
              // Update it! It's here because it needs an update or a create
              const {
                $id,
                $createdAt,
                $updatedAt,
                $permissions,
                $databaseId,
                $collectionId,
                $sequence,
                ...docData
              } = doc;
              await tryAwaitWithRetry(async () =>
                targetDb.updateDocument(
                  targetDbId,
                  targetCollectionId,
                  doc.$id,
                  docData,
                  doc.$permissions
                )
              );
              successCount++;
            } catch (updateError) {
              // just send the error to the formatter
              MessageFormatter.error(
                `Failed to transfer document ${doc.$id}`,
                updateError instanceof Error
                  ? updateError
                  : new Error(String(updateError)),
                { prefix: "Transfer" }
              );
            }
          }

          MessageFormatter.error(
            `Failed to transfer document ${doc.$id}`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Transfer" }
          );
        }
      })
    );

    await Promise.all(transferTasks);
    return successCount;
  }

  /**
   * Update documents individually with content and/or permission changes
   */
  private async updateDocumentsIndividual(
    targetDb: Databases,
    targetDbId: string,
    targetCollectionId: string,
    documentPairs: {
      doc: Models.Document;
      targetDoc: Models.Document;
      reason: string;
    }[]
  ): Promise<number> {
    let successCount = 0;

    const updateTasks = documentPairs.map(({ doc, targetDoc, reason }) =>
      this.limit(async () => {
        try {
          const {
            $id,
            $createdAt,
            $updatedAt,
            $permissions,
            $databaseId,
            $collectionId,
            $sequence,
            ...docData
          } = doc;

          await tryAwaitWithRetry(async () =>
            targetDb.updateDocument(
              targetDbId,
              targetCollectionId,
              doc.$id,
              docData,
              $permissions,
            )
          );

          successCount++;
        } catch (error) {
          MessageFormatter.error(
            `Failed to update document ${doc.$id} (${reason})`,
            error instanceof Error ? error : new Error(String(error)),
            { prefix: "Transfer" }
          );
        }
      })
    );

    await Promise.all(updateTasks);
    return successCount;
  }

  /**
   * Utility method to chunk arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Helper method to fetch all teams with pagination
   */
  private async fetchAllTeams(
    teams: Teams
  ): Promise<Models.Team<Models.Preferences>[]> {
    const teamsList: Models.Team<Models.Preferences>[] = [];
    let lastId: string | undefined;

    while (true) {
      const queries = [Query.limit(100)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const result = await tryAwaitWithRetry(async () => teams.list(queries));

      if (result.teams.length === 0) {
        break;
      }

      teamsList.push(...result.teams);

      if (result.teams.length < 100) {
        break;
      }

      lastId = result.teams[result.teams.length - 1].$id;
    }

    return teamsList;
  }

  /**
   * Helper method to fetch all memberships for a team with pagination
   */
  private async fetchAllMemberships(
    teamId: string
  ): Promise<Models.Membership[]> {
    const membershipsList: Models.Membership[] = [];
    let lastId: string | undefined;

    while (true) {
      const queries = [Query.limit(100)];
      if (lastId) {
        queries.push(Query.cursorAfter(lastId));
      }

      const result = await tryAwaitWithRetry(async () =>
        this.sourceTeams.listMemberships(teamId, queries)
      );

      if (result.memberships.length === 0) {
        break;
      }

      membershipsList.push(...result.memberships);

      if (result.memberships.length < 100) {
        break;
      }

      lastId = result.memberships[result.memberships.length - 1].$id;
    }

    return membershipsList;
  }

  /**
   * Helper method to transfer team memberships
   */
  private async transferTeamMemberships(teamId: string): Promise<void> {
    MessageFormatter.info(`Transferring memberships for team ${teamId}`, {
      prefix: "Transfer",
    });

    try {
      // Fetch all memberships for this team
      const memberships = await this.fetchAllMemberships(teamId);

      if (memberships.length === 0) {
        MessageFormatter.info(`No memberships found for team ${teamId}`, {
          prefix: "Transfer",
        });
        return;
      }

      MessageFormatter.info(
        `Found ${memberships.length} memberships for team ${teamId}`,
        { prefix: "Transfer" }
      );

      let totalTransferred = 0;

      // Transfer memberships with rate limiting
      const transferTasks = memberships.map((membership) =>
        this.userLimit(async () => {
          // Use userLimit for team operations (more sensitive)
          try {
            // Check if membership already exists and compare roles
            let existingMembership: Models.Membership | null = null;
            try {
              existingMembership = await this.targetTeams.getMembership(
                teamId,
                membership.$id
              );

              // Compare roles between source and target membership
              const sourceRoles = JSON.stringify(
                membership.roles?.sort() || []
              );
              const targetRoles = JSON.stringify(
                existingMembership.roles?.sort() || []
              );

              if (sourceRoles !== targetRoles) {
                MessageFormatter.warning(
                  `Membership ${membership.$id} exists but has different roles. Source: ${sourceRoles}, Target: ${targetRoles}`,
                  { prefix: "Transfer" }
                );

                // Update membership roles to match source
                try {
                  await this.targetTeams.updateMembership(
                    teamId,
                    membership.$id,
                    membership.roles
                  );
                  MessageFormatter.success(
                    `Updated membership ${membership.$id} roles to match source`,
                    { prefix: "Transfer" }
                  );
                } catch (updateError) {
                  MessageFormatter.error(
                    `Failed to update roles for membership ${membership.$id}`,
                    updateError instanceof Error
                      ? updateError
                      : new Error(String(updateError)),
                    { prefix: "Transfer" }
                  );
                }
              } else {
                MessageFormatter.info(
                  `Membership ${membership.$id} already exists with matching roles, skipping`,
                  { prefix: "Transfer" }
                );
              }
              return;
            } catch (error) {
              // Membership doesn't exist, proceed with creation
            }

            // Get user data from target (users should already be transferred)
            let userData: Models.User<Record<string, any>> | null = null;
            try {
              userData = await this.targetUsers.get(membership.userId);
            } catch (error) {
              MessageFormatter.warning(
                `User ${membership.userId} not found in target, membership ${membership.$id} may fail`,
                { prefix: "Transfer" }
              );
            }

            // Create membership using the comprehensive user data
            await tryAwaitWithRetry(async () =>
              this.targetTeams.createMembership(
                teamId,
                membership.roles,
                userData?.email || membership.userEmail, // Use target user email if available, fallback to membership email
                membership.userId, // User ID
                userData?.phone || undefined, // Use target user phone if available
                undefined, // Invitation URL placeholder
                userData?.name || membership.userName // Use target user name if available, fallback to membership name
              )
            );

            totalTransferred++;
            MessageFormatter.success(
              `Transferred membership ${membership.$id} for user ${
                userData?.name || membership.userName
              }`,
              { prefix: "Transfer" }
            );
          } catch (error) {
            MessageFormatter.error(
              `Failed to transfer membership ${membership.$id}`,
              error instanceof Error ? error : new Error(String(error)),
              { prefix: "Transfer" }
            );
          }
        })
      );

      await Promise.all(transferTasks);
      MessageFormatter.info(
        `Transferred ${totalTransferred} memberships for team ${teamId}`,
        { prefix: "Transfer" }
      );
    } catch (error) {
      MessageFormatter.error(
        `Failed to transfer memberships for team ${teamId}`,
        error instanceof Error ? error : new Error(String(error)),
        { prefix: "Transfer" }
      );
    }
  }

  private printSummary(): void {
    const duration = Math.round((Date.now() - this.startTime) / 1000);

    MessageFormatter.info("=== COMPREHENSIVE TRANSFER SUMMARY ===", {
      prefix: "Transfer",
    });
    MessageFormatter.info(`Total Time: ${duration}s`, { prefix: "Transfer" });
    MessageFormatter.info(
      `Users: ${this.results.users.transferred} transferred, ${this.results.users.skipped} skipped, ${this.results.users.failed} failed`,
      { prefix: "Transfer" }
    );
    MessageFormatter.info(
      `Teams: ${this.results.teams.transferred} transferred, ${this.results.teams.skipped} skipped, ${this.results.teams.failed} failed`,
      { prefix: "Transfer" }
    );
    MessageFormatter.info(
      `Databases: ${this.results.databases.transferred} transferred, ${this.results.databases.skipped} skipped, ${this.results.databases.failed} failed`,
      { prefix: "Transfer" }
    );
    MessageFormatter.info(
      `Buckets: ${this.results.buckets.transferred} transferred, ${this.results.buckets.skipped} skipped, ${this.results.buckets.failed} failed`,
      { prefix: "Transfer" }
    );
    MessageFormatter.info(
      `Functions: ${this.results.functions.transferred} transferred, ${this.results.functions.skipped} skipped, ${this.results.functions.failed} failed`,
      { prefix: "Transfer" }
    );

    const totalTransferred =
      this.results.users.transferred +
      this.results.teams.transferred +
      this.results.databases.transferred +
      this.results.buckets.transferred +
      this.results.functions.transferred;
    const totalFailed =
      this.results.users.failed +
      this.results.teams.failed +
      this.results.databases.failed +
      this.results.buckets.failed +
      this.results.functions.failed;

    if (totalFailed === 0) {
      MessageFormatter.success(
        `All ${totalTransferred} items transferred successfully!`,
        { prefix: "Transfer" }
      );
    } else {
      MessageFormatter.warning(
        `${totalTransferred} items transferred, ${totalFailed} failed`,
        { prefix: "Transfer" }
      );
    }
  }
}
