import path from "path";
import fs from "fs";
import type { AttributeMappings, AppwriteConfig } from "appwrite-utils";
import type { ImportDataActions } from "../importDataActions.js";
import { logger } from "../../shared/logging.js";
import { RateLimitManager } from "./RateLimitManager.js";

/**
 * Service responsible for file handling during import.
 * Preserves all existing file handling capabilities including URL support.
 * Extracted from DataLoader to provide focused, testable file operations.
 */
export class FileHandlerService {
  private appwriteFolderPath: string;
  private config: AppwriteConfig;
  private importDataActions: ImportDataActions;
  private rateLimitManager: RateLimitManager;

  constructor(
    appwriteFolderPath: string,
    config: AppwriteConfig,
    importDataActions: ImportDataActions,
    rateLimitManager?: RateLimitManager
  ) {
    this.appwriteFolderPath = appwriteFolderPath;
    this.config = config;
    this.importDataActions = importDataActions;
    this.rateLimitManager = rateLimitManager || new RateLimitManager();
  }

  /**
   * Generates attribute mappings with post-import actions based on the provided attribute mappings.
   * This method checks each mapping for a fileData attribute and adds a post-import action to create a file
   * and update the field with the file's ID if necessary.
   * 
   * Preserves existing file handling logic from DataLoader.
   *
   * @param attributeMappings - The attribute mappings from the import definition.
   * @param context - The context object containing information about the database, collection, and document.
   * @param item - The item being imported, used for resolving template paths in fileData mappings.
   * @returns The attribute mappings updated with any necessary post-import actions.
   */
  getAttributeMappingsWithFileActions(
    attributeMappings: AttributeMappings,
    context: any,
    item: any
  ): AttributeMappings {
    // Iterate over each attribute mapping to check for fileData attributes
    return attributeMappings.map((mapping) => {
      if (mapping.fileData) {
        // Resolve the file path using the provided template, context, and item
        let mappingFilePath = this.importDataActions.resolveTemplate(
          mapping.fileData.path,
          context,
          item
        );
        
        // Ensure the file path is absolute if it doesn't start with "http"
        if (!mappingFilePath.toLowerCase().startsWith("http")) {
          mappingFilePath = this.resolveLocalFilePath(mappingFilePath);
        }
        
        // Define the after-import action to create a file and update the field
        const afterImportAction = {
          action: "createFileAndUpdateField",
          params: [
            "{dbId}",
            "{collId}",
            "{docId}",
            mapping.targetKey,
            `${this.config!.documentBucketId}_${context.dbName
              .toLowerCase()
              .replace(" ", "")}`, // Bucket ID pattern
            mappingFilePath,
            mapping.fileData.name,
          ],
        };
        
        // Add the after-import action to the mapping's postImportActions array
        const postImportActions = mapping.postImportActions
          ? [...mapping.postImportActions, afterImportAction]
          : [afterImportAction];
        
        return { ...mapping, postImportActions };
      }
      
      // Return the mapping unchanged if no fileData attribute is found
      return mapping;
    });
  }

  /**
   * Resolves local file path, searching in subdirectories if needed.
   * Preserves existing file search logic from DataLoader.
   * 
   * @param mappingFilePath - The relative file path from the mapping
   * @returns Resolved absolute file path
   */
  private resolveLocalFilePath(mappingFilePath: string): string {
    // First try the direct path
    let fullPath = path.resolve(this.appwriteFolderPath, mappingFilePath);

    // If file doesn't exist, search in subdirectories
    if (!fs.existsSync(fullPath)) {
      const findFileInDir = (dir: string): string | null => {
        try {
          const files = fs.readdirSync(dir);

          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
              // Recursively search subdirectories
              const found = findFileInDir(filePath);
              if (found) return found;
            } else if (file === path.basename(mappingFilePath)) {
              return filePath;
            }
          }
        } catch (error) {
          logger.warn(`Error reading directory ${dir}: ${error}`);
        }
        return null;
      };

      const foundPath = findFileInDir(this.appwriteFolderPath);
      if (foundPath) {
        mappingFilePath = foundPath;
      } else {
        logger.warn(
          `File not found in any subdirectory: ${mappingFilePath}`
        );
        // Keep the original resolved path as fallback
        mappingFilePath = fullPath;
      }
    } else {
      mappingFilePath = fullPath;
    }

    return mappingFilePath;
  }

  /**
   * Executes file-related post-import actions with rate limiting.
   * Wraps the existing createFileAndUpdateField action with proper error handling and rate limiting.
   * 
   * @param context - The context containing document and collection information
   * @param postImportActions - The post-import actions to execute
   */
  async executeFileActions(
    context: any,
    postImportActions: any[]
  ): Promise<void> {
    const fileActions = postImportActions.filter(
      action => action.action === "createFileAndUpdateField"
    );

    if (fileActions.length === 0) {
      return;
    }

    // Execute file actions with rate limiting
    const filePromises = fileActions.map(action =>
      this.rateLimitManager.fileUpload(() => this.executeFileAction(action, context))
    );

    try {
      await Promise.allSettled(filePromises);
    } catch (error) {
      logger.error(`Error executing file actions for context: ${JSON.stringify(context, null, 2)}`, error);
    }
  }

  /**
   * Executes a single file action with proper error handling.
   * 
   * @param action - The file action to execute
   * @param context - The context for template resolution
   */
  private async executeFileAction(action: any, context: any): Promise<void> {
    try {
      // Resolve parameters using existing template resolution
      const resolvedParams = action.params.map((param: any) =>
        this.importDataActions.resolveTemplate(param, context, context)
      );

      // Execute the createFileAndUpdateField action
      await this.importDataActions.executeAction(
        action.action,
        resolvedParams,
        context,
        context
      );
    } catch (error) {
      logger.error(
        `Failed to execute file action '${action.action}' with params: ${JSON.stringify(action.params, null, 2)}`,
        error
      );
      // Don't throw - we want to continue with other file operations
    }
  }

  /**
   * Validates that file paths exist before import begins.
   * Provides early validation to catch file issues before processing starts.
   * 
   * @param attributeMappings - The attribute mappings to validate
   * @param context - The context for template resolution
   * @param item - The item for template resolution
   * @returns Array of validation errors (empty if all valid)
   */
  validateFilePaths(
    attributeMappings: AttributeMappings,
    context: any,
    item: any
  ): string[] {
    const errors: string[] = [];

    for (const mapping of attributeMappings) {
      if (mapping.fileData) {
        try {
          let filePath = this.importDataActions.resolveTemplate(
            mapping.fileData.path,
            context,
            item
          );

          // Skip URL validation (URLs are handled by the action itself)
          if (filePath.toLowerCase().startsWith("http")) {
            continue;
          }

          // Check if local file exists
          const resolvedPath = this.resolveLocalFilePath(filePath);
          if (!fs.existsSync(resolvedPath)) {
            errors.push(
              `File not found for mapping '${mapping.targetKey}': ${resolvedPath}`
            );
          }
        } catch (error) {
          errors.push(
            `Error validating file path for mapping '${mapping.targetKey}': ${error}`
          );
        }
      }
    }

    return errors;
  }

  /**
   * Gets file statistics for import planning.
   * Helps estimate import time and resource requirements.
   * 
   * @param attributeMappings - The attribute mappings to analyze
   * @param items - The items that will be imported
   * @returns File statistics object
   */
  getFileStatistics(attributeMappings: AttributeMappings, items: any[]): {
    totalFiles: number;
    urlFiles: number;
    localFiles: number;
    estimatedSize: number;
  } {
    let totalFiles = 0;
    let urlFiles = 0;
    let localFiles = 0;
    let estimatedSize = 0;

    const fileAttributeMappings = attributeMappings.filter(mapping => mapping.fileData);
    
    for (const item of items) {
      for (const mapping of fileAttributeMappings) {
        totalFiles++;
        
        try {
          const filePath = this.importDataActions.resolveTemplate(
            mapping.fileData!.path,
            {},
            item
          );

          if (filePath.toLowerCase().startsWith("http")) {
            urlFiles++;
          } else {
            localFiles++;
            try {
              const resolvedPath = this.resolveLocalFilePath(filePath);
              if (fs.existsSync(resolvedPath)) {
                const stats = fs.statSync(resolvedPath);
                estimatedSize += stats.size;
              }
            } catch (error) {
              // Ignore errors for statistics
            }
          }
        } catch (error) {
          // Ignore errors for statistics
        }
      }
    }

    return {
      totalFiles,
      urlFiles,
      localFiles,
      estimatedSize
    };
  }
}