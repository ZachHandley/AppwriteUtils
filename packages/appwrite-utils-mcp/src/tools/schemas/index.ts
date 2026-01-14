/**
 * Schema tools for MCP
 * @packageDocumentation
 */

import { z } from 'zod';
import path from 'path';
import type { ToolGroupDefinition, ToolContext } from '../ToolGroup.js';
import type { AppwriteConfig } from 'appwrite-utils';
import {
  ConfigManager,
  SchemaGenerator,
  JsonSchemaGenerator,
  PydanticModelGenerator,
  ConstantsGenerator,
} from 'appwrite-utils-helpers';

// ──────────────────────────────────────────────────
// INPUT SCHEMAS
// ──────────────────────────────────────────────────

/**
 * Schema for generate_typescript_schemas input
 */
const GenerateTypeScriptSchemasSchema = z.object({
  databaseId: z.string().describe('Database ID to generate schemas for'),
  outputDir: z.string().optional().describe('Optional output directory for schemas (defaults to schemas/)'),
});

/**
 * Schema for generate_json_schemas input
 */
const GenerateJsonSchemasSchema = z.object({
  databaseId: z.string().describe('Database ID to generate JSON schemas for'),
  outputDir: z.string().optional().describe('Optional output directory for JSON schemas (defaults to schemas/)'),
});

/**
 * Schema for generate_pydantic_models input
 */
const GeneratePydanticModelsSchema = z.object({
  databaseId: z.string().describe('Database ID to generate Pydantic models for'),
  outputDir: z.string().optional().describe('Optional output directory for Pydantic models (defaults to schemas/)'),
});

/**
 * Schema for generate_constants input
 */
const GenerateConstantsSchema = z.object({
  languages: z.array(
    z.enum(['typescript', 'javascript', 'python', 'php', 'dart', 'json', 'env'])
  ).optional().default(['typescript']).describe('Languages to generate constants for'),
  outputDir: z.string().optional().describe('Optional output directory for constants (defaults to constants/)'),
});

// ──────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────

/**
 * Get configuration and appwrite folder path
 */
async function getConfigAndPath(context: ToolContext): Promise<{ config: AppwriteConfig; appwriteFolderPath: string }> {
  const configManager = ConfigManager.getInstance();

  // Load config if not already loaded
  if (!configManager.hasConfig()) {
    await configManager.loadConfig({
      validate: true,
      reportValidation: false,
    });
  }

  const config = configManager.getConfig();
  const configPath = configManager.getConfigPath();

  if (!configPath) {
    throw new Error('Configuration path not available');
  }

  // Get the directory containing the config file (.appwrite folder)
  const appwriteFolderPath = path.dirname(configPath);

  return { config, appwriteFolderPath };
}

/**
 * Filter config to only include specified database
 */
function filterConfigByDatabase(config: AppwriteConfig, databaseId: string): AppwriteConfig {
  const database = config.databases?.find((db: any) => db.$id === databaseId);

  if (!database) {
    throw new Error(`Database with ID '${databaseId}' not found in configuration`);
  }

  // Filter collections to only those in this database
  const databaseCollections = config.collections?.filter(
    (collection: any) => collection.databaseId === databaseId
  );

  return {
    ...config,
    databases: [database],
    collections: databaseCollections || [],
  };
}

// ──────────────────────────────────────────────────
// TOOL HANDLERS
// ──────────────────────────────────────────────────

/**
 * Generate TypeScript/Zod schemas for a database
 */
async function handleGenerateTypeScriptSchemas(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; message: string; outputDir?: string }> {
  const { databaseId, outputDir } = GenerateTypeScriptSchemasSchema.parse(input);

  const { config, appwriteFolderPath } = await getConfigAndPath(context);
  const filteredConfig = filterConfigByDatabase(config, databaseId);

  const generator = new SchemaGenerator(filteredConfig, appwriteFolderPath);

  await generator.generateSchemas({
    format: 'zod',
    verbose: true,
    outputDir,
  });

  const resolvedOutputDir = outputDir || path.join(appwriteFolderPath, 'schemas');

  return {
    success: true,
    message: `TypeScript/Zod schemas generated successfully for database '${databaseId}'`,
    outputDir: resolvedOutputDir,
  };
}

/**
 * Generate JSON schemas for a database
 */
async function handleGenerateJsonSchemas(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; message: string; outputDir?: string }> {
  const { databaseId, outputDir } = GenerateJsonSchemasSchema.parse(input);

  const { config, appwriteFolderPath } = await getConfigAndPath(context);
  const filteredConfig = filterConfigByDatabase(config, databaseId);

  const generator = new SchemaGenerator(filteredConfig, appwriteFolderPath);

  await generator.generateSchemas({
    format: 'json',
    verbose: true,
    outputDir,
  });

  const resolvedOutputDir = outputDir || path.join(appwriteFolderPath, 'schemas');

  return {
    success: true,
    message: `JSON schemas generated successfully for database '${databaseId}'`,
    outputDir: resolvedOutputDir,
  };
}

/**
 * Generate Pydantic models for a database
 */
async function handleGeneratePydanticModels(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; message: string; outputDir?: string }> {
  const { databaseId, outputDir } = GeneratePydanticModelsSchema.parse(input);

  const { config, appwriteFolderPath } = await getConfigAndPath(context);
  const filteredConfig = filterConfigByDatabase(config, databaseId);

  const generator = new PydanticModelGenerator(filteredConfig, appwriteFolderPath);

  const baseOutputDirectory = outputDir || path.join(appwriteFolderPath, 'schemas');

  generator.generatePydanticModels({
    baseOutputDirectory,
    verbose: true,
  });

  return {
    success: true,
    message: `Pydantic models generated successfully for database '${databaseId}'`,
    outputDir: baseOutputDirectory,
  };
}

/**
 * Generate constants in multiple languages
 */
async function handleGenerateConstants(
  input: unknown,
  context: ToolContext
): Promise<{ success: boolean; message: string; outputDir?: string; languages: string[] }> {
  const { languages, outputDir } = GenerateConstantsSchema.parse(input);

  const { config, appwriteFolderPath } = await getConfigAndPath(context);

  const generator = new ConstantsGenerator(config);

  const resolvedOutputDir = outputDir || path.join(appwriteFolderPath, 'constants');

  await generator.generateFiles(languages, resolvedOutputDir, {
    databases: true,
    collections: true,
    buckets: true,
    functions: true,
  });

  return {
    success: true,
    message: `Constants generated successfully for languages: ${languages.join(', ')}`,
    outputDir: resolvedOutputDir,
    languages,
  };
}

// ──────────────────────────────────────────────────
// TOOL GROUP DEFINITION
// ──────────────────────────────────────────────────

/**
 * Schema tools for generating TypeScript/Zod schemas, JSON schemas, Pydantic models, and constants
 */
export const schemasToolGroup: ToolGroupDefinition = {
  name: 'schemas',
  flag: 'schemas',
  description: 'Tools for generating schemas and constants from Appwrite configuration',
  tools: [
    {
      name: 'generate_typescript_schemas',
      description: 'Generate TypeScript/Zod schemas for validating documents in a database. Creates type-safe schemas with runtime validation.',
      inputSchema: GenerateTypeScriptSchemasSchema,
      handler: handleGenerateTypeScriptSchemas,
      requiresAuth: false,
    },
    {
      name: 'generate_json_schemas',
      description: 'Generate JSON Schema files for a database. Useful for documentation and validation in non-TypeScript environments.',
      inputSchema: GenerateJsonSchemasSchema,
      handler: handleGenerateJsonSchemas,
      requiresAuth: false,
    },
    {
      name: 'generate_pydantic_models',
      description: 'Generate Pydantic models for Python applications. Creates type-safe models with validation for Appwrite documents.',
      inputSchema: GeneratePydanticModelsSchema,
      handler: handleGeneratePydanticModels,
      requiresAuth: false,
    },
    {
      name: 'generate_constants',
      description: 'Generate ID constants for databases, collections, buckets, and functions in multiple programming languages. Prevents hardcoding IDs in your codebase.',
      inputSchema: GenerateConstantsSchema,
      handler: handleGenerateConstants,
      requiresAuth: false,
    },
  ],
};
