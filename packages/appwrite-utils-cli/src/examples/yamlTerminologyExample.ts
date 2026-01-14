/**
 * Example demonstrating YAML import/export with dual terminology support
 *
 * This example shows how to:
 * 1. Generate YAML files for both collections and tables
 * 2. Load and convert between terminologies
 * 3. Validate terminology consistency
 * 4. Migrate between formats
 */

import {
  collectionToYaml,
  generateYamlTemplate,
  generateExampleYamls,
  convertTerminology,
  normalizeYamlData,
  usesTableTerminology,
  type YamlTerminologyConfig,
  type YamlCollectionData
} from "appwrite-utils-helpers";
import { createYamlLoader } from "appwrite-utils-helpers";
import { YamlImportIntegration } from "../migrations/yaml/YamlImportIntegration.js";
import { createImportSchemas } from "../migrations/yaml/generateImportSchemas.js";
import {
  CollectionCreateSchema,
  type CollectionCreate
} from "appwrite-utils";
import fs from "fs";
import path from "path";

/**
 * Example 1: Generate YAML templates for both collection and table formats
 */
export async function generateTemplateExamples(outputDir: string): Promise<void> {
  console.log("🚀 Generating YAML template examples...");

  // Ensure output directories exist
  const collectionsDir = path.join(outputDir, "collections");
  const tablesDir = path.join(outputDir, "tables");

  [collectionsDir, tablesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Generate schemas first
  await createImportSchemas(outputDir);

  // Generate examples for both formats
  const examples = generateExampleYamls("Product");

  // Save collection format
  const collectionPath = path.join(collectionsDir, "Product.yaml");
  fs.writeFileSync(collectionPath, examples.collection);
  console.log(`✅ Generated collection YAML: ${collectionPath}`);

  // Save table format
  const tablePath = path.join(tablesDir, "Product.yaml");
  fs.writeFileSync(tablePath, examples.table);
  console.log(`✅ Generated table YAML: ${tablePath}`);
}

/**
 * Example 2: Convert existing collection definition to different formats
 */
export function convertCollectionFormats(collection: CollectionCreate): void {
  console.log("🔄 Converting collection to different YAML formats...");

  // Generate collection format YAML
  const collectionConfig: YamlTerminologyConfig = {
    useTableTerminology: false,
    entityType: 'collection',
    schemaPath: "../.yaml_schemas/collection.schema.json"
  };
  const collectionYaml = collectionToYaml(collection, collectionConfig);
  console.log("📄 Collection Format YAML:");
  console.log(collectionYaml);
  console.log("");

  // Generate table format YAML
  const tableConfig: YamlTerminologyConfig = {
    useTableTerminology: true,
    entityType: 'table',
    schemaPath: "../.yaml_schemas/table.schema.json"
  };
  const tableYaml = collectionToYaml(collection, tableConfig);
  console.log("📄 Table Format YAML:");
  console.log(tableYaml);
}

/**
 * Example 3: Load and process YAML files with mixed terminologies
 */
export async function processYamlFiles(baseDir: string): Promise<void> {
  console.log("📂 Processing YAML files with terminology support...");

  const yamlLoader = createYamlLoader(baseDir);

  // Load all YAML files from collections directory
  const collectionsResult = await yamlLoader.loadDirectoryYamls("collections");
  console.log(`📊 Collections Summary:`, collectionsResult.summary);

  // Load all YAML files from tables directory
  const tablesResult = await yamlLoader.loadDirectoryYamls("tables");
  console.log(`📊 Tables Summary:`, tablesResult.summary);

  // Process each file and show terminology detection
  console.log("\\n🔍 File Analysis:");
  [...collectionsResult.collections, ...tablesResult.collections].forEach(file => {
    const terminology = file.originalTerminology;
    const hasColumns = usesTableTerminology(file.data);
    console.log(`  ${file.filePath}: ${terminology} format (uses table terminology: ${hasColumns})`);
  });
}

/**
 * Example 4: Migrate between terminologies
 */
export async function migrateTerminology(baseDir: string): Promise<void> {
  console.log("🔄 Migrating between terminologies...");

  const yamlLoader = createYamlLoader(baseDir);

  // Migrate collections to table format
  console.log("\\n📤 Migrating collections to table format...");
  const collectionToTableResult = await yamlLoader.migrateTerminology(
    "collections",
    "migrated/tables",
    true // to table terminology
  );
  console.log(`✅ Migration complete: ${collectionToTableResult.migrated} migrated, ${collectionToTableResult.skipped} skipped`);
  if (collectionToTableResult.errors.length > 0) {
    console.log(`❌ Errors:`, collectionToTableResult.errors);
  }

  // Migrate tables to collection format
  console.log("\\n📤 Migrating tables to collection format...");
  const tableToCollectionResult = await yamlLoader.migrateTerminology(
    "tables",
    "migrated/collections",
    false // to collection terminology
  );
  console.log(`✅ Migration complete: ${tableToCollectionResult.migrated} migrated, ${tableToCollectionResult.skipped} skipped`);
  if (tableToCollectionResult.errors.length > 0) {
    console.log(`❌ Errors:`, tableToCollectionResult.errors);
  }
}

/**
 * Example 5: Validate terminology consistency
 */
export async function validateTerminology(baseDir: string): Promise<void> {
  console.log("🔍 Validating terminology consistency...");

  const yamlLoader = createYamlLoader(baseDir);

  // Validate collections directory
  const collectionsValidation = await yamlLoader.validateTerminologyConsistency("collections");
  console.log("\\n📂 Collections Directory:");
  console.log(`  Consistent: ${collectionsValidation.isConsistent}`);
  console.log(`  Summary:`, collectionsValidation.summary);
  if (collectionsValidation.issues.length > 0) {
    console.log(`  Issues:`);
    collectionsValidation.issues.forEach(issue => {
      console.log(`    ${issue.severity.toUpperCase()}: ${issue.file} - ${issue.issue}`);
    });
  }

  // Validate tables directory
  const tablesValidation = await yamlLoader.validateTerminologyConsistency("tables");
  console.log("\\n📂 Tables Directory:");
  console.log(`  Consistent: ${tablesValidation.isConsistent}`);
  console.log(`  Summary:`, tablesValidation.summary);
  if (tablesValidation.issues.length > 0) {
    console.log(`  Issues:`);
    tablesValidation.issues.forEach(issue => {
      console.log(`    ${issue.severity.toUpperCase()}: ${issue.file} - ${issue.issue}`);
    });
  }
}

/**
 * Example 6: Import configuration with terminology support
 */
export async function importConfigurationExample(appwriteFolderPath: string): Promise<void> {
  console.log("📥 Import configuration with terminology support...");

  const yamlImportIntegration = new YamlImportIntegration(appwriteFolderPath);

  // Initialize YAML import system
  await yamlImportIntegration.initialize();

  // Create example import configurations for both formats
  console.log("\\n📝 Creating import configuration templates...");

  // Collection format import config
  await yamlImportIntegration.createFromTemplate(
    "Users",
    "users.json",
    false, // collection terminology
    "users-collection-import.yaml"
  );

  // Table format import config
  await yamlImportIntegration.createFromTemplate(
    "Users",
    "users.json",
    true, // table terminology
    "users-table-import.yaml"
  );

  // Get statistics
  const stats = await yamlImportIntegration.getStatistics();
  console.log("\\n📊 Import Configuration Statistics:");
  console.log(`  Total configurations: ${stats.totalConfigurations}`);
  console.log(`  Collections with configs: ${stats.collectionsWithConfigs}`);
  console.log(`  Total attribute mappings: ${stats.totalAttributeMappings}`);
  console.log(`  Total relationship mappings: ${stats.totalRelationshipMappings}`);
}

/**
 * Example 7: Manual terminology conversion
 */
export function manualTerminologyConversion(): void {
  console.log("🔧 Manual terminology conversion example...");

  // Sample YAML data with collection terminology
  const collectionData: YamlCollectionData = {
    name: "Product",
    id: "product",
    attributes: [
      {
        key: "name",
        type: "string",
        required: true,
        relatedCollection: "Categories"
      }
    ],
    indexes: [
      {
        key: "name_index",
        type: "key",
        attributes: ["name"]
      }
    ]
  };

  console.log("\\n📝 Original (Collection format):");
  console.log(JSON.stringify(collectionData, null, 2));

  // Convert to table terminology
  const tableData = convertTerminology(collectionData, true);
  console.log("\\n🔄 Converted to Table format:");
  console.log(JSON.stringify(tableData, null, 2));

  // Convert back to collection terminology
  const normalizedData = normalizeYamlData(tableData);
  console.log("\\n↩️  Normalized back to Collection format:");
  console.log(JSON.stringify(normalizedData, null, 2));

  // Terminology detection
  console.log("\\n🔍 Terminology Detection:");
  console.log(`  Original uses table terminology: ${usesTableTerminology(collectionData)}`);
  console.log(`  Converted uses table terminology: ${usesTableTerminology(tableData)}`);
  console.log(`  Normalized uses table terminology: ${usesTableTerminology(normalizedData)}`);
}

/**
 * Main example runner
 */
export async function runYamlTerminologyExamples(outputDir: string): Promise<void> {
  console.log("🎯 Running YAML Terminology Examples\\n");

  try {
    // Example collection for demonstrations
    const exampleCollectionInput: CollectionCreate = {
      name: "Product",
      $id: "product",
      enabled: true,
      documentSecurity: false,
      $permissions: [],
      attributes: [
        {
          key: "name",
          type: "string",
          required: true,
          size: 255
        },
        {
          key: "price",
          type: "double",
          required: true,
          min: 0
        },
        {
          key: "categoryId",
          type: "relationship",
          relationType: "manyToOne",
          relatedCollection: "Categories",
          twoWay: false,
          onDelete: "setNull",
          required: false
        }
      ],
      indexes: [
        {
          key: "name_index",
          type: "key",
          attributes: ["name"]
        }
      ],
      importDefs: []
    };
    const exampleCollection = CollectionCreateSchema.parse(exampleCollectionInput);

    // Run examples
    await generateTemplateExamples(outputDir);
    console.log("\\n" + "=".repeat(60) + "\\n");

    convertCollectionFormats(exampleCollection);
    console.log("\\n" + "=".repeat(60) + "\\n");

    await processYamlFiles(outputDir);
    console.log("\\n" + "=".repeat(60) + "\\n");

    await migrateTerminology(outputDir);
    console.log("\\n" + "=".repeat(60) + "\\n");

    await validateTerminology(outputDir);
    console.log("\\n" + "=".repeat(60) + "\\n");

    await importConfigurationExample(outputDir);
    console.log("\\n" + "=".repeat(60) + "\\n");

    manualTerminologyConversion();

    console.log("\\n🎉 All examples completed successfully!");

  } catch (error) {
    console.error("❌ Error running examples:", error);
    throw error;
  }
}

// Note: Functions are already exported above with their declarations
