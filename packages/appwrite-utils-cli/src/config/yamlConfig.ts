import { z } from "zod";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { AppwriteConfigSchema, type AppwriteConfig, RuntimeSchema, FunctionScopes, FunctionSpecifications, permissionsSchema, PermissionToAppwritePermission, type AppwriteFunction } from "appwrite-utils";
import { shouldIgnoreDirectory } from "../utils/directoryUtils.js";
import { MessageFormatter } from "../shared/messageFormatter.js";

const YamlConfigSchema = z.object({
  appwrite: z.object({
    endpoint: z.string().default("https://cloud.appwrite.io/v1"),
    project: z.string(),
    key: z.string(),
    // Session authentication support
    sessionCookie: z.string().optional(),
    authMethod: z.enum(["session", "apikey", "auto"]).optional().default("auto"),
    sessionMetadata: z.object({
      email: z.string().optional(),
      expiresAt: z.string().optional(),
    }).optional(),
  }),
  logging: z
    .object({
      enabled: z.boolean().default(false),
      level: z.enum(["error", "warn", "info", "debug"]).default("info"),
      directory: z.string().optional(),
      console: z.boolean().default(false),
    })
    .optional()
    .default({ enabled: false, level: "info", console: false }),
  backups: z
    .object({
      enabled: z.boolean().default(true),
      interval: z.number().default(3600),
      retention: z.number().default(30),
      cleanup: z.boolean().default(true),
    })
    .optional()
    .default({ enabled: true, interval: 3600, retention: 30, cleanup: true }),
  data: z
    .object({
      enableMockData: z.boolean().default(false),
      documentBucketId: z.string().default("documents"),
      usersCollectionName: z.string().default("Members"),
      importDirectory: z.string().default("importData"),
    })
    .optional()
    .default({
      enableMockData: false,
      documentBucketId: "documents",
      usersCollectionName: "Members",
      importDirectory: "importData",
    }),
  schemas: z
    .object({
      outputDirectory: z.string().default("schemas"),
      yamlSchemaDirectory: z.string().default(".yaml_schemas"),
      collectionsDirectory: z.string().default("collections"),
      tablesDirectory: z.string().default("tables"),
    })
    .optional()
    .default({
      outputDirectory: "schemas",
      yamlSchemaDirectory: ".yaml_schemas",
      collectionsDirectory: "collections",
      tablesDirectory: "tables",
    }),
  migrations: z
    .object({
      enabled: z.boolean().default(false),
    })
    .optional()
    .default({
      enabled: true,
    }),
  databases: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        bucket: z
          .object({
            id: z.string(),
            name: z.string(),
            permissions: permissionsSchema,
            fileSecurity: z.boolean().optional(),
            enabled: z.boolean().optional(),
            maximumFileSize: z.number().optional(),
            allowedFileExtensions: z.array(z.string()).optional(),
            compression: z.enum(["none", "gzip", "zstd"]).optional(),
            encryption: z.boolean().optional(),
            antivirus: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .optional()
    .default([
      { id: "dev", name: "Development" },
      { id: "main", name: "Main" },
      { id: "staging", name: "Staging" },
    ]),
  buckets: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        permissions: permissionsSchema,
        fileSecurity: z.boolean().optional(),
        enabled: z.boolean().optional(),
        maximumFileSize: z.number().optional(),
        allowedFileExtensions: z.array(z.string()).optional(),
        compression: z.enum(["none", "gzip", "zstd"]).optional(),
        encryption: z.boolean().optional(),
        antivirus: z.boolean().optional(),
      })
    )
    .optional()
    .default([]),
  functions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        runtime: RuntimeSchema,
        execute: z.array(z.string()).optional(),
        events: z.array(z.string()).optional(),
        schedule: z.string().optional(),
        timeout: z.number().optional(),
        enabled: z.boolean().optional(),
        logging: z.boolean().optional(),
        entrypoint: z.string().optional(),
        commands: z.string().optional(),
        scopes: z.array(FunctionScopes).optional(),
        installationId: z.string().optional(),
        providerRepositoryId: z.string().optional(),
        providerBranch: z.string().optional(),
        providerSilentMode: z.boolean().optional(),
        providerRootDirectory: z.string().optional(),
        templateRepository: z.string().optional(),
        templateOwner: z.string().optional(),
        templateRootDirectory: z.string().optional(),
        templateBranch: z.string().optional(),
        specification: FunctionSpecifications.optional(),
        // Critical missing fields for function deployment
        dirPath: z.string().optional(),
        predeployCommands: z.array(z.string()).optional(),
        deployDir: z.string().optional(),
        ignore: z.array(z.string()).optional(),
        templateVersion: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

export type YamlConfig = z.infer<typeof YamlConfigSchema>;

export const convertYamlToAppwriteConfig = (yamlConfig: YamlConfig): AppwriteConfig => {
  const appwriteConfig: AppwriteConfig = {
    appwriteEndpoint: yamlConfig.appwrite.endpoint,
    appwriteProject: yamlConfig.appwrite.project,
    appwriteKey: yamlConfig.appwrite.key,
    // Session authentication support from YAML
    sessionCookie: yamlConfig.appwrite.sessionCookie,
    authMethod: yamlConfig.appwrite.authMethod || "auto",
    sessionMetadata: yamlConfig.appwrite.sessionMetadata,
    apiMode: "auto", // Default to auto-detect for dual API support
    appwriteClient: null,
    logging: {
      enabled: yamlConfig.logging.enabled,
      level: yamlConfig.logging.level,
      logDirectory: yamlConfig.logging.directory,
      console: yamlConfig.logging.console,
    },
    enableBackups: yamlConfig.backups.enabled,
    backupInterval: yamlConfig.backups.interval,
    backupRetention: yamlConfig.backups.retention,
    enableBackupCleanup: yamlConfig.backups.cleanup,
    enableMockData: yamlConfig.data.enableMockData,
    documentBucketId: yamlConfig.data.documentBucketId,
    usersCollectionName: yamlConfig.data.usersCollectionName,
    schemaConfig: {
      outputDirectory: yamlConfig.schemas.outputDirectory,
      yamlSchemaDirectory: yamlConfig.schemas.yamlSchemaDirectory,
      importDirectory: yamlConfig.data.importDirectory,
      collectionsDirectory: yamlConfig.schemas.collectionsDirectory || "collections",
      tablesDirectory: yamlConfig.schemas.tablesDirectory || "tables",
    },
    databases: yamlConfig.databases.map((db) => ({
      $id: db.id,
      name: db.name,
      bucket: db.bucket
        ? {
            $id: db.bucket.id,
            name: db.bucket.name,
            $permissions: PermissionToAppwritePermission(db.bucket.permissions),
            fileSecurity: db.bucket.fileSecurity || false,
            enabled: db.bucket.enabled || true,
            maximumFileSize: db.bucket.maximumFileSize || 30000000,
            allowedFileExtensions: db.bucket.allowedFileExtensions || [],
            compression: (db.bucket.compression as "none" | "gzip" | "zstd") || "none",
            encryption: db.bucket.encryption || false,
            antivirus: db.bucket.antivirus || false,
          }
        : undefined,
    })),
    buckets: yamlConfig.buckets.map((bucket) => ({
      $id: bucket.id,
      name: bucket.name,
      $permissions: PermissionToAppwritePermission(bucket.permissions),
      fileSecurity: bucket.fileSecurity || false,
      enabled: bucket.enabled || true,
      maximumFileSize: bucket.maximumFileSize || 30000000,
      allowedFileExtensions: bucket.allowedFileExtensions || [],
      compression: (bucket.compression as "none" | "gzip" | "zstd") || "none",
      encryption: bucket.encryption || false,
      antivirus: bucket.antivirus || false,
    })),
    functions: yamlConfig.functions?.map((func) => ({
      $id: func.id,
      name: func.name,
      runtime: func.runtime,
      execute: func.execute || [],
      events: func.events || [],
      schedule: func.schedule || "",
      timeout: func.timeout || 15,
      enabled: func.enabled || true,
      logging: func.logging || true,
      entrypoint: func.entrypoint || "",
      commands: func.commands || "",
      scopes: func.scopes || [],
      installationId: func.installationId || "",
      providerRepositoryId: func.providerRepositoryId || "",
      providerBranch: func.providerBranch || "",
      providerSilentMode: func.providerSilentMode || false,
      providerRootDirectory: func.providerRootDirectory || "",
      templateRepository: func.templateRepository || "",
      templateOwner: func.templateOwner || "",
      templateRootDirectory: func.templateRootDirectory || "",
      templateBranch: func.templateBranch || "",
      specification: func.specification || "s-0.5vcpu-512mb",
      // Include critical missing fields for function deployment
      dirPath: func.dirPath,
      predeployCommands: func.predeployCommands,
      deployDir: func.deployDir,
      ignore: func.ignore,
      templateVersion: func.templateVersion,
    })),
    collections: [], // Note: Collections are managed separately in YAML configs via individual collection files
  };

  return appwriteConfig;
};

/**
 * Enhanced config loading with session authentication support
 * Supports session override options for preserving session state
 */
export interface YamlSessionOptions {
  sessionCookie?: string;
  authMethod?: "session" | "apikey" | "auto";
  sessionMetadata?: { email?: string; expiresAt?: string; };
}

/**
 * Load YAML config with optional session preservation
 * Maintains authentication priority: explicit session > YAML file > system prefs
 */
export const loadYamlConfigWithSession = async (
  configPath: string,
  sessionOptions?: YamlSessionOptions
): Promise<AppwriteConfig | null> => {
  try {
    const fileContent = fs.readFileSync(configPath, "utf8");
    const yamlData = yaml.load(fileContent) as unknown;

    const yamlConfig = YamlConfigSchema.parse(yamlData);
    const appwriteConfig = convertYamlToAppwriteConfig(yamlConfig);

    // Apply session preservation if provided (explicit overrides take priority)
    if (sessionOptions) {
      if (sessionOptions.sessionCookie) {
        appwriteConfig.sessionCookie = sessionOptions.sessionCookie;
      }
      if (sessionOptions.authMethod) {
        appwriteConfig.authMethod = sessionOptions.authMethod;
      }
      if (sessionOptions.sessionMetadata) {
        appwriteConfig.sessionMetadata = sessionOptions.sessionMetadata;
      }
    }

    return appwriteConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      MessageFormatter.error("YAML config validation failed", undefined, { prefix: "Config" });
      error.issues.forEach((err) => {
        MessageFormatter.error(`${err.path.join('.')} → ${err.message}`, undefined, { prefix: "Config" });
      });
    } else {
      MessageFormatter.error("Error loading YAML config", error instanceof Error ? error : undefined, { prefix: "Config" });
      if (error instanceof Error && error.stack) {
        MessageFormatter.debug("Stack trace", error.stack, { prefix: "Config" });
      }
    }
    return null;
  }
};

export const loadYamlConfig = async (configPath: string): Promise<AppwriteConfig | null> => {
  try {
    const fileContent = fs.readFileSync(configPath, "utf8");
    const yamlData = yaml.load(fileContent) as unknown;

    const yamlConfig = YamlConfigSchema.parse(yamlData);
    return convertYamlToAppwriteConfig(yamlConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      MessageFormatter.error("YAML config validation failed", undefined, { prefix: "Config" });
      error.issues.forEach((err) => {
        MessageFormatter.error(`${err.path.join('.')} → ${err.message}`, undefined, { prefix: "Config" });
      });
    } else {
      MessageFormatter.error("Error loading YAML config", error instanceof Error ? error : undefined, { prefix: "Config" });
      if (error instanceof Error && error.stack) {
        MessageFormatter.debug("Stack trace", error.stack, { prefix: "Config" });
      }
    }
    return null;
  }
};

export const findYamlConfig = (startDir: string): string | null => {
  // First check current directory for YAML configs
  const possiblePaths = [
    path.join(startDir, ".appwrite", "config.yaml"),
    path.join(startDir, ".appwrite", "config.yml"),
    path.join(startDir, ".appwrite", "appwriteConfig.yaml"),
    path.join(startDir, ".appwrite", "appwriteConfig.yml"),
    path.join(startDir, "appwrite.yaml"),
    path.join(startDir, "appwrite.yml"),
  ];

  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  // Recursively search subdirectories for .appwrite folders
  const yamlConfigInSubdirs = findYamlConfigRecursive(startDir);
  if (yamlConfigInSubdirs) {
    return yamlConfigInSubdirs;
  }

  // Only check one level up to avoid infinite traversal
  const parentDir = path.dirname(startDir);
  if (parentDir !== startDir && path.basename(parentDir) !== 'node_modules') {
    const parentPossiblePaths = [
      path.join(parentDir, ".appwrite", "config.yaml"),
      path.join(parentDir, ".appwrite", "config.yml"),
      path.join(parentDir, ".appwrite", "appwriteConfig.yaml"),
      path.join(parentDir, ".appwrite", "appwriteConfig.yml"),
      path.join(parentDir, "appwrite.yaml"),
      path.join(parentDir, "appwrite.yml"),
    ];

    for (const configPath of parentPossiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }
  }

  return null;
};

const findYamlConfigRecursive = (dir: string, depth: number = 0): string | null => {
  // Limit search depth to prevent infinite recursion
  if (depth > 5) {
    return null;
  }

  if (shouldIgnoreDirectory(path.basename(dir))) {
    return null;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !shouldIgnoreDirectory(entry.name)) {
        const fullPath = path.join(dir, entry.name);
        
        // Check if this is an .appwrite directory
        if (entry.name === ".appwrite") {
          const configPaths = [
            path.join(fullPath, "config.yaml"),
            path.join(fullPath, "config.yml"),
            path.join(fullPath, "appwriteConfig.yaml"),
            path.join(fullPath, "appwriteConfig.yml"),
          ];
          
          for (const configPath of configPaths) {
            if (fs.existsSync(configPath)) {
              return configPath;
            }
          }
        }
        
        // Recurse into other directories with increased depth
        const result = findYamlConfigRecursive(fullPath, depth + 1);
        if (result) return result;
      }
    }
  } catch (error) {
    // Ignore directory access errors
  }

  return null;
};

export const generateYamlConfigTemplate = (outputPath: string) => {
  const template: YamlConfig = {
    appwrite: {
      endpoint: "https://cloud.appwrite.io/v1",
      project: "YOUR_PROJECT_ID",
      key: "YOUR_API_KEY",
      authMethod: "auto" as const,
      // Optional session authentication (leave empty to use API key)
      // sessionCookie: "session_cookie_from_appwrite_cli",
    },
    logging: {
      enabled: false,
      level: "info",
      console: false,
    },
    backups: {
      enabled: true,
      interval: 3600,
      retention: 30,
      cleanup: true,
    },
    data: {
      enableMockData: false,
      documentBucketId: "documents",
      usersCollectionName: "Members",
      importDirectory: "importData",
    },
    schemas: {
      outputDirectory: "schemas",
      yamlSchemaDirectory: ".yaml_schemas",
      collectionsDirectory: "collections",
      tablesDirectory: "tables",
    },
    migrations: {
      enabled: true,
    },
    databases: [
      { id: "dev", name: "Development" },
      { id: "main", name: "Main" },
      { id: "staging", name: "Staging" },
    ],
    buckets: [],
    functions: [],
  };

  let yamlContent = yaml.dump(template, {
    indent: 2,
    lineWidth: 120,
    sortKeys: false,
  });

  // Add inline comments to the schemas section
  yamlContent = yamlContent.replace(
    /schemas:\s*\n(\s*)outputDirectory: schemas\n(\s*)yamlSchemaDirectory: \.yaml_schemas\n(\s*)collectionsDirectory: collections\n(\s*)tablesDirectory: tables/,
    `schemas:
$1outputDirectory: schemas
$2yamlSchemaDirectory: .yaml_schemas
$3# Directory for legacy Databases API collection definitions
$3collectionsDirectory: collections
$4# Directory for new TablesDB API table definitions
$4tablesDirectory: tables`
  );

  // Add schema reference header and documentation
  const schemaReference = "# yaml-language-server: $schema=./.yaml_schemas/appwrite-config.schema.json\n";
  const documentation = `# Appwrite Project Configuration
#
# Authentication Configuration:
# - key: Standard API key authentication
# - sessionCookie: Session cookie from Appwrite CLI authentication
# - authMethod: "auto" (detects available method), "session" (prefer session), "apikey" (prefer API key)
# - Priority: Explicit CLI args > YAML config > ~/.appwrite/prefs.json > Error
#
# Directory Configuration:
# - collectionsDirectory: Use for legacy Databases API (default: "collections")
# - tablesDirectory: Use for new TablesDB API (default: "tables")
# - API mode is auto-detected based on server version, or set explicitly via apiMode
#
# For dual API support, both directories can coexist with different definitions

`;
  const finalContent = schemaReference + documentation + yamlContent;

  fs.writeFileSync(outputPath, finalContent, "utf8");
};

/**
 * Converts AppwriteConfig back to YAML format and writes to file
 * @param configPath Path to the YAML config file
 * @param config The AppwriteConfig to convert and save
 */
export const writeYamlConfig = async (configPath: string, config: AppwriteConfig): Promise<void> => {
  try {
    // Convert AppwriteConfig back to YAML format
    const yamlConfig: YamlConfig = {
      appwrite: {
        endpoint: config.appwriteEndpoint,
        project: config.appwriteProject,
        key: config.appwriteKey,
        // Include session authentication fields
        sessionCookie: config.sessionCookie,
        authMethod: config.authMethod || "auto",
        sessionMetadata: config.sessionMetadata,
      },
      logging: {
        enabled: config.logging?.enabled || false,
        level: config.logging?.level || "info",
        directory: config.logging?.logDirectory,
        console: config.logging?.console || false,
      },
      backups: {
        enabled: config.enableBackups !== false,
        interval: config.backupInterval || 3600,
        retention: config.backupRetention || 30,
        cleanup: config.enableBackupCleanup !== false,
      },
      data: {
        enableMockData: config.enableMockData || false,
        documentBucketId: config.documentBucketId || "documents",
        usersCollectionName: config.usersCollectionName || "Members",
        importDirectory: config.schemaConfig?.importDirectory || "importData",
      },
      schemas: {
        outputDirectory: config.schemaConfig?.outputDirectory || "schemas",
        yamlSchemaDirectory: config.schemaConfig?.yamlSchemaDirectory || ".yaml_schemas",
        collectionsDirectory: config.schemaConfig?.collectionsDirectory || "collections",
        tablesDirectory: config.schemaConfig?.tablesDirectory || "tables",
      },
      migrations: {
        enabled: true,
      },
      databases: config.databases?.map(db => ({
        id: db.$id,
        name: db.name,
        bucket: db.bucket ? {
          id: db.bucket.$id,
          name: db.bucket.name,
          permissions: db.bucket.permissions || [],
          fileSecurity: db.bucket.fileSecurity,
          enabled: db.bucket.enabled,
          maximumFileSize: db.bucket.maximumFileSize,
          allowedFileExtensions: db.bucket.allowedFileExtensions,
          compression: db.bucket.compression as "none" | "gzip" | "zstd",
          encryption: db.bucket.encryption,
          antivirus: db.bucket.antivirus,
        } : undefined,
      })) || [],
      buckets: config.buckets?.map(bucket => ({
        id: bucket.$id,
        name: bucket.name,
        permissions: bucket.permissions || [],
        fileSecurity: bucket.fileSecurity,
        enabled: bucket.enabled,
        maximumFileSize: bucket.maximumFileSize,
        allowedFileExtensions: bucket.allowedFileExtensions,
        compression: bucket.compression as "none" | "gzip" | "zstd",
        encryption: bucket.encryption,
        antivirus: bucket.antivirus,
      })) || [],
      functions: config.functions?.map(func => ({
        id: func.$id,
        name: func.name,
        runtime: func.runtime,
        execute: func.execute,
        events: func.events,
        schedule: func.schedule,
        timeout: func.timeout,
        enabled: func.enabled,
        logging: func.logging,
        entrypoint: func.entrypoint,
        commands: func.commands,
        scopes: func.scopes,
        installationId: func.installationId,
        providerRepositoryId: func.providerRepositoryId,
        providerBranch: func.providerBranch,
        providerSilentMode: func.providerSilentMode,
        providerRootDirectory: func.providerRootDirectory,
        templateRepository: func.templateRepository,
        templateOwner: func.templateOwner,
        templateRootDirectory: func.templateRootDirectory,
        specification: func.specification,
        // Include critical fields for function deployment
        dirPath: func.dirPath,
        predeployCommands: func.predeployCommands,
        deployDir: func.deployDir,
        ignore: func.ignore,
        templateVersion: func.templateVersion,
      })) || [],
    };

    // Write YAML config
    const yamlContent = yaml.dump(yamlConfig, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false,
    });

    // Preserve schema reference if it exists
    let finalContent = yamlContent;
    if (fs.existsSync(configPath)) {
      const existingContent = fs.readFileSync(configPath, "utf8");
      const lines = existingContent.split('\n');
      const schemaLine = lines.find(line => line.startsWith('# yaml-language-server:'));
      const commentLine = lines.find(line => line.startsWith('# Appwrite Project Configuration'));
      
      if (schemaLine) {
        finalContent = schemaLine + '\n';
        if (commentLine) {
          finalContent += commentLine + '\n';
        }
        finalContent += yamlContent;
      }
    } else {
      // Add schema reference for new files
      const schemaReference = "# yaml-language-server: $schema=./.yaml_schemas/appwrite-config.schema.json\n";
      finalContent = schemaReference + "# Appwrite Project Configuration\n" + yamlContent;
    }

    fs.writeFileSync(configPath, finalContent, "utf8");
    MessageFormatter.success(`Updated YAML configuration at ${configPath}`, { prefix: "Config" });
  } catch (error) {
    MessageFormatter.error("Error writing YAML config", error instanceof Error ? error : undefined, { prefix: "Config" });
    throw error;
  }
};

/**
 * Adds a new function to the YAML config file
 * @param configPath Path to the YAML config file
 * @param newFunction The function configuration to add
 */
export const addFunctionToYamlConfig = async (configPath: string, newFunction: AppwriteFunction): Promise<void> => {
  try {
    // Read current config
    const fileContent = fs.readFileSync(configPath, "utf8");
    const yamlData = yaml.load(fileContent) as any;
    
    // Initialize functions array if it doesn't exist
    if (!yamlData.functions) {
      yamlData.functions = [];
    }
    
    // Convert AppwriteFunction to YAML format
    const yamlFunction = {
      id: newFunction.$id,
      name: newFunction.name,
      runtime: newFunction.runtime,
      execute: newFunction.execute || ["any"],
      events: newFunction.events || [],
      schedule: newFunction.schedule || "",
      timeout: newFunction.timeout || 15,
      enabled: newFunction.enabled !== false,
      logging: newFunction.logging !== false,
      entrypoint: newFunction.entrypoint || "",
      commands: newFunction.commands || "",
      scopes: newFunction.scopes || [],
      specification: newFunction.specification || "s-0.5vcpu-512mb",
      // Include critical fields for function deployment if they exist
      ...(newFunction.dirPath && { dirPath: newFunction.dirPath }),
      ...(newFunction.predeployCommands && { predeployCommands: newFunction.predeployCommands }),
      ...(newFunction.deployDir && { deployDir: newFunction.deployDir }),
      ...(newFunction.ignore && { ignore: newFunction.ignore }),
      ...(newFunction.templateVersion && { templateVersion: newFunction.templateVersion }),
    };
    
    // Add new function
    yamlData.functions.push(yamlFunction);
    
    // Write back to file
    const updatedYamlContent = yaml.dump(yamlData, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false,
    });
    
    // Preserve schema reference if it exists
    const lines = fileContent.split('\n');
    const schemaLine = lines.find(line => line.startsWith('# yaml-language-server:'));
    let finalContent = updatedYamlContent;
    
    if (schemaLine) {
      finalContent = schemaLine + '\n' + updatedYamlContent;
    }
    
    fs.writeFileSync(configPath, finalContent, "utf8");
    MessageFormatter.success(`Added function "${newFunction.name}" to YAML config`, { prefix: "Config" });
  } catch (error) {
    MessageFormatter.error("Error adding function to YAML config", error instanceof Error ? error : undefined, { prefix: "Config" });
    throw error;
  }
};

/**
 * Extract session options from AppwriteConfig for YAML operations
 * Useful for preserving session state during config reloads
 */
export const extractSessionOptionsFromConfig = (config: AppwriteConfig): YamlSessionOptions => {
  return {
    sessionCookie: config.sessionCookie,
    authMethod: config.authMethod,
    sessionMetadata: config.sessionMetadata,
  };
};

/**
 * Create session-preserved YAML config operations
 * Maintains authentication state during config file updates
 */
export const createSessionPreservingYamlConfig = (configPath: string, sessionOptions: YamlSessionOptions) => {
  return {
    load: () => loadYamlConfigWithSession(configPath, sessionOptions),
    write: (config: AppwriteConfig) => {
      // Merge session options into config before writing
      const enhancedConfig = {
        ...config,
        sessionCookie: sessionOptions.sessionCookie || config.sessionCookie,
        authMethod: sessionOptions.authMethod || config.authMethod,
        sessionMetadata: sessionOptions.sessionMetadata || config.sessionMetadata,
      };
      return writeYamlConfig(configPath, enhancedConfig);
    },
    addFunction: (func: AppwriteFunction) => addFunctionToYamlConfig(configPath, func),
  };
};

/**
 * Determine if YAML config has session authentication configured
 */
export const hasYamlSessionAuth = (configPath: string): boolean => {
  try {
    const fileContent = fs.readFileSync(configPath, "utf8");
    const yamlData = yaml.load(fileContent) as any;

    return !!(yamlData?.appwrite?.sessionCookie && yamlData.appwrite.sessionCookie.trim());
  } catch (error) {
    return false;
  }
};