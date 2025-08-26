import { z } from "zod";
import { ID } from "node-appwrite";
import type {
  AttributeMappings,
  AppwriteConfig,
} from "appwrite-utils";
import { AuthUserCreateSchema } from "../../schemas/authUser.js";
import { logger } from "../../shared/logging.js";
import type { DataTransformationService } from "./DataTransformationService.js";

/**
 * Service responsible for user mapping and deduplication during import.
 * Preserves all existing sophisticated user handling logic from DataLoader.
 * Extracted to provide focused, testable user management operations.
 */
export class UserMappingService {
  private config: AppwriteConfig;
  private dataTransformationService: DataTransformationService;
  
  // Maps to hold email and phone to user ID mappings for uniqueness in User Accounts
  private emailToUserIdMap = new Map<string, string>();
  private phoneToUserIdMap = new Map<string, string>();
  private userIdSet = new Set<string>();
  
  // Map to hold the merged user map for relationship resolution
  // Will hold an array of the old user ID's that are mapped to the same new user ID
  // For example, if there are two users with the same email, they will both be mapped to the same new user ID
  // Prevents duplicate users with the other two maps below it and allows me to keep the old ID's
  private mergedUserMap = new Map<string, string[]>();
  
  // Map to track existing users
  public userExistsMap = new Map<string, boolean>();

  constructor(
    config: AppwriteConfig,
    dataTransformationService: DataTransformationService
  ) {
    this.config = config;
    this.dataTransformationService = dataTransformationService;
  }

  /**
   * Initializes user maps with existing users from the system.
   * Preserves existing user loading logic from DataLoader.
   * 
   * @param existingUsers - Array of existing users from the system
   */
  initializeWithExistingUsers(existingUsers: any[]): void {
    // Clear existing maps
    this.emailToUserIdMap.clear();
    this.phoneToUserIdMap.clear();
    this.userIdSet.clear();
    this.userExistsMap.clear();

    // Iterate over the users and setup our maps ahead of time for email and phone
    for (const user of existingUsers) {
      if (user.email) {
        this.emailToUserIdMap.set(user.email.toLowerCase(), user.$id);
      }
      if (user.phone) {
        this.phoneToUserIdMap.set(user.phone, user.$id);
      }
      this.userExistsMap.set(user.$id, true);
      this.userIdSet.add(user.$id);
    }

    logger.info(`Initialized user maps with ${existingUsers.length} existing users`);
  }

  /**
   * Generates a unique ID that doesn't conflict with existing user IDs.
   * Preserves existing unique ID generation logic from DataLoader.
   * 
   * @param collectionName - The collection name for context
   * @returns A truly unique ID
   */
  getTrueUniqueUserId(collectionName: string): string {
    let newId = ID.unique();
    let condition =
      this.userExistsMap.has(newId) ||
      this.userIdSet.has(newId) ||
      Array.from(this.emailToUserIdMap.values()).includes(newId) ||
      Array.from(this.phoneToUserIdMap.values()).includes(newId);
      
    while (condition) {
      newId = ID.unique();
      condition =
        this.userExistsMap.has(newId) ||
        this.userIdSet.has(newId) ||
        Array.from(this.emailToUserIdMap.values()).includes(newId) ||
        Array.from(this.phoneToUserIdMap.values()).includes(newId);
    }
    return newId;
  }

  /**
   * Prepares user data by checking for duplicates based on email or phone, adding to a duplicate map if found,
   * and then returning the transformed item without user-specific keys.
   * 
   * Preserves existing sophisticated user deduplication logic from DataLoader.
   *
   * @param item - The raw item to be processed.
   * @param attributeMappings - The attribute mappings for the item.
   * @param primaryKeyField - The primary key field name
   * @param newId - The proposed new ID for the user
   * @returns Object containing transformed item, existing ID if duplicate, and user data
   */
  prepareUserData(
    item: any,
    attributeMappings: AttributeMappings,
    primaryKeyField: string,
    newId: string
  ): {
    transformedItem: any;
    existingId: string | undefined;
    userData: {
      rawData: any;
      finalData: z.infer<typeof AuthUserCreateSchema>;
    };
  } {
    // Ensure we have a truly unique ID
    if (
      this.userIdSet.has(newId) ||
      this.userExistsMap.has(newId) ||
      Array.from(this.emailToUserIdMap.values()).includes(newId) ||
      Array.from(this.phoneToUserIdMap.values()).includes(newId)
    ) {
      newId = this.getTrueUniqueUserId("users");
    }

    let transformedItem = this.dataTransformationService.transformData(item, attributeMappings);
    let userData = AuthUserCreateSchema.safeParse(transformedItem);
    
    if (userData.data?.email) {
      userData.data.email = userData.data.email.toLowerCase();
    }
    
    if (!userData.success || !(userData.data.email || userData.data.phone)) {
      logger.error(
        `Invalid user data: ${JSON.stringify(
          userData.error?.issues,
          undefined,
          2
        )} or missing email/phone`
      );

      const userKeys = ["email", "phone", "name", "labels", "prefs"];
      userKeys.forEach((key) => {
        if (transformedItem.hasOwnProperty(key)) {
          delete transformedItem[key];
        }
      });
      
      return {
        transformedItem,
        existingId: undefined,
        userData: {
          rawData: item,
          finalData: transformedItem,
        },
      };
    }

    const email = userData.data.email?.toLowerCase();
    const phone = userData.data.phone;
    let existingId: string | undefined;

    // Check for duplicate email and phone
    if (email && this.emailToUserIdMap.has(email)) {
      existingId = this.emailToUserIdMap.get(email);
      if (phone && !this.phoneToUserIdMap.has(phone)) {
        this.phoneToUserIdMap.set(phone, newId);
      }
    } else if (phone && this.phoneToUserIdMap.has(phone)) {
      existingId = this.phoneToUserIdMap.get(phone);
      if (email && !this.emailToUserIdMap.has(email)) {
        this.emailToUserIdMap.set(email, newId);
      }
    } else {
      if (email) this.emailToUserIdMap.set(email, newId);
      if (phone) this.phoneToUserIdMap.set(phone, newId);
    }

    if (existingId) {
      userData.data.userId = existingId;
      const mergedUsers = this.mergedUserMap.get(existingId) || [];
      mergedUsers.push(`${item[primaryKeyField]}`);
      this.mergedUserMap.set(existingId, mergedUsers);

      const userKeys = ["email", "phone", "name", "labels", "prefs"];
      userKeys.forEach((key) => {
        if (transformedItem.hasOwnProperty(key)) {
          delete transformedItem[key];
        }
      });
      
      return {
        transformedItem: {
          ...transformedItem,
          userId: existingId,
          docId: existingId,
        },
        existingId,
        userData: {
          rawData: item,
          finalData: userData.data,
        },
      };
    } else {
      existingId = newId;
      userData.data.userId = existingId;
    }

    const userKeys = ["email", "phone", "name", "labels", "prefs"];
    userKeys.forEach((key) => {
      if (transformedItem.hasOwnProperty(key)) {
        delete transformedItem[key];
      }
    });

    this.userIdSet.add(existingId);

    return {
      transformedItem: {
        ...transformedItem,
        userId: existingId,
        docId: existingId,
      },
      existingId,
      userData: {
        rawData: item,
        finalData: userData.data,
      },
    };
  }

  /**
   * Checks if a collection is the users collection based on configuration.
   * 
   * @param collectionName - The collection name to check
   * @returns True if this is the users collection
   */
  isUsersCollection(collectionName: string): boolean {
    return !!(
      this.config.usersCollectionName &&
      this.getCollectionKey(this.config.usersCollectionName) ===
        this.getCollectionKey(collectionName)
    );
  }

  /**
   * Helper method to generate a consistent key for collections.
   * Preserves existing logic from DataLoader.
   */
  private getCollectionKey(name: string): string {
    return name.toLowerCase().replace(" ", "");
  }

  /**
   * Gets merged user mappings for relationship resolution.
   * 
   * @returns Map of merged user IDs to arrays of original IDs
   */
  getMergedUserMap(): Map<string, string[]> {
    return new Map(this.mergedUserMap);
  }

  /**
   * Finds the new user ID for an old user ID, considering merged users.
   * Preserves existing merged user lookup logic from DataLoader.
   * 
   * @param oldId - The old user ID to look up
   * @returns The new user ID if found, otherwise the original ID
   */
  findNewUserIdForOldId(oldId: string): string {
    // Check if this old ID was merged into another user
    for (const [newUserId, oldUserIds] of this.mergedUserMap.entries()) {
      if (oldUserIds.includes(`${oldId}`)) {
        return newUserId;
      }
    }
    
    // If not found in merged users, return the original ID
    return oldId;
  }

  /**
   * Merges user data from duplicate entries.
   * Preserves existing user data merging logic.
   * 
   * @param existingUserData - The existing user data
   * @param newUserData - The new user data to merge
   * @returns Merged user data
   */
  mergeUserData(existingUserData: any, newUserData: any): any {
    return this.dataTransformationService.mergeObjects(existingUserData, newUserData);
  }

  /**
   * Gets statistics about user mapping operations.
   * Useful for import planning and reporting.
   * 
   * @returns User mapping statistics
   */
  getStatistics(): {
    totalExistingUsers: number;
    emailMappings: number;
    phoneMappings: number;
    mergedUsers: number;
    totalMergedOldIds: number;
  } {
    let totalMergedOldIds = 0;
    for (const oldIds of this.mergedUserMap.values()) {
      totalMergedOldIds += oldIds.length;
    }

    return {
      totalExistingUsers: this.userExistsMap.size,
      emailMappings: this.emailToUserIdMap.size,
      phoneMappings: this.phoneToUserIdMap.size,
      mergedUsers: this.mergedUserMap.size,
      totalMergedOldIds,
    };
  }

  /**
   * Validates user mapping configuration.
   * Ensures the user mapping setup is correct before import.
   * 
   * @returns Array of validation errors (empty if valid)
   */
  validateConfiguration(): string[] {
    const errors: string[] = [];

    if (!this.config.usersCollectionName) {
      errors.push("usersCollectionName is not configured");
    }

    if (!this.config.documentBucketId) {
      errors.push("documentBucketId is not configured");
    }

    return errors;
  }
}