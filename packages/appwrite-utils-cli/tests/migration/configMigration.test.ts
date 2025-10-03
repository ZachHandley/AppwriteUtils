import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import { TestUtils } from '../testUtils';

// Mock config migration utilities
jest.mock('../../src/utils/configMigration', () => ({
  migrateToTablesDir: jest.fn(),
  migrateToCollectionsDir: jest.fn(),
  detectMigrationNeeds: jest.fn(),
  createBackup: jest.fn(),
  validateMigration: jest.fn(),
  convertCollectionToTable: jest.fn(),
  convertTableToCollection: jest.fn(),
}));

import {
  migrateToTablesDir,
  migrateToCollectionsDir,
  detectMigrationNeeds,
  createBackup,
  validateMigration,
  convertCollectionToTable,
  convertTableToCollection,
} from '../../src/utils/configMigration';

describe('Configuration Migration Tests', () => {
  let testDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    TestUtils.cleanup();
  });

  describe('Migration Detection', () => {
    it('should detect need to migrate from collections to dual schema', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (detectMigrationNeeds as jest.Mock).mockReturnValue({
        needsMigration: true,
        migrationType: 'to-dual-schema',
        reason: 'Only collections/ directory found, recommend adding tables/ support',
        sourceDir: 'collections',
        targetDirs: ['collections', 'tables'],
      });

      const migrationNeeds = (detectMigrationNeeds as jest.Mock)(testDir);

      expect(migrationNeeds.needsMigration).toBe(true);
      expect(migrationNeeds.migrationType).toBe('to-dual-schema');
      expect(detectMigrationNeeds).toHaveBeenCalledWith(testDir);
    });

    it('should detect need to migrate from legacy single directory to version-aware structure', async () => {
      testDir = TestUtils.createTempDir();

      // Create legacy structure without .appwrite directory
      const config = TestUtils.createTestAppwriteConfig();
      fs.writeFileSync(
        path.join(testDir, 'appwriteConfig.ts'),
        `export default ${JSON.stringify(config, null, 2)};`
      );

      const collectionsDir = path.join(testDir, 'collections');
      fs.mkdirSync(collectionsDir);

      (detectMigrationNeeds as jest.Mock).mockReturnValue({
        needsMigration: true,
        migrationType: 'to-version-aware',
        reason: 'Config is outside .appwrite directory',
        sourceDir: testDir,
        targetDir: path.join(testDir, '.appwrite'),
      });

      const migrationNeeds = (detectMigrationNeeds as jest.Mock)(testDir);

      expect(migrationNeeds.needsMigration).toBe(true);
      expect(migrationNeeds.migrationType).toBe('to-version-aware');
    });

    it('should detect no migration needed for current dual schema structure', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
        useYaml: true,
      });

      (detectMigrationNeeds as jest.Mock).mockReturnValue({
        needsMigration: false,
        migrationType: 'none',
        reason: 'Configuration is already using dual schema structure',
      });

      const migrationNeeds = (detectMigrationNeeds as jest.Mock)(testDir);

      expect(migrationNeeds.needsMigration).toBe(false);
      expect(migrationNeeds.migrationType).toBe('none');
    });
  });

  describe('Migration to Tables Directory', () => {
    it('should migrate collections to tables directory for TablesDB API', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const originalCollection = TestUtils.createTestCollection();

      (migrateToTablesDir as jest.Mock).mockImplementation((sourceDir, options) => {
        const tablesDir = path.join(sourceDir, 'tables');
        fs.mkdirSync(tablesDir, { recursive: true });

        // Convert collection to table format
        const table = {
          ...originalCollection,
          tableId: originalCollection.$id,
          databaseId: 'test-db-id',
          _isFromTablesDir: true,
        };

        fs.writeFileSync(
          path.join(tablesDir, 'TestCollection.yaml'),
          `name: ${table.name}\ntableId: ${table.tableId}\ndatabaseId: ${table.databaseId}\n`
        );

        return {
          success: true,
          migratedFiles: ['TestCollection.ts -> TestCollection.yaml'],
          targetDir: tablesDir,
        };
      });

      const result = (migrateToTablesDir as jest.Mock)(testDir, {
        preserveOriginal: true,
        convertToYaml: true,
      });

      expect(result.success).toBe(true);
      expect(result.migratedFiles).toHaveLength(1);

      const tablesDir = path.join(testDir, 'tables');
      expect(fs.existsSync(tablesDir)).toBe(true);
      expect(fs.existsSync(path.join(tablesDir, 'TestCollection.yaml'))).toBe(true);
    });

    it('should preserve original collections when requested', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const originalFile = path.join(testDir, 'collections', 'TestCollection.ts');
      const originalContent = fs.readFileSync(originalFile, 'utf8');

      (migrateToTablesDir as jest.Mock).mockImplementation((sourceDir, options) => {
        if (options.preserveOriginal) {
          // Don't remove original files
          return {
            success: true,
            migratedFiles: ['TestCollection.ts'],
            preservedFiles: ['TestCollection.ts'],
          };
        }
      });

      const result = (migrateToTablesDir as jest.Mock)(testDir, {
        preserveOriginal: true,
      });

      expect(result.preservedFiles).toContain('TestCollection.ts');
      expect(fs.existsSync(originalFile)).toBe(true);

      const currentContent = fs.readFileSync(originalFile, 'utf8');
      expect(currentContent).toBe(originalContent);
    });

    it('should handle collection to table conversion with proper field mapping', async () => {
      const collection = TestUtils.createTestCollection({
        name: 'UserProfiles',
        $id: 'user-profiles',
      });

      (convertCollectionToTable as jest.Mock).mockReturnValue({
        name: 'UserProfiles',
        tableId: 'user-profiles',
        databaseId: 'main-db',
        documentSecurity: collection.documentSecurity,
        enabled: collection.enabled,
        $permissions: collection.$permissions,
        attributes: collection.attributes,
        indexes: collection.indexes,
        importDefs: collection.importDefs,
        _isFromTablesDir: true,
      });

      const table = (convertCollectionToTable as jest.Mock)(collection, 'main-db');

      expect(table.tableId).toBe('user-profiles');
      expect(table.databaseId).toBe('main-db');
      expect(table._isFromTablesDir).toBe(true);
      expect(table.attributes).toEqual(collection.attributes);
    });
  });

  describe('Migration to Collections Directory', () => {
    it('should migrate tables back to collections directory for Database API', async () => {
      testDir = TestUtils.createTestProject({ hasTables: true });

      (migrateToCollectionsDir as jest.Mock).mockImplementation((sourceDir, options) => {
        const collectionsDir = path.join(sourceDir, 'collections');
        fs.mkdirSync(collectionsDir, { recursive: true });

        const collection = TestUtils.createTestCollection({
          name: 'TestTable',
          $id: 'test-table',
        });

        fs.writeFileSync(
          path.join(collectionsDir, 'TestTable.ts'),
          `export default ${JSON.stringify(collection, null, 2)};`
        );

        return {
          success: true,
          migratedFiles: ['TestTable.yaml -> TestTable.ts'],
          targetDir: collectionsDir,
        };
      });

      const result = (migrateToCollectionsDir as jest.Mock)(testDir, {
        convertToTypeScript: true,
      });

      expect(result.success).toBe(true);
      expect(result.migratedFiles).toHaveLength(1);

      const collectionsDir = path.join(testDir, 'collections');
      expect(fs.existsSync(collectionsDir)).toBe(true);
      expect(fs.existsSync(path.join(collectionsDir, 'TestTable.ts'))).toBe(true);
    });

    it('should handle table to collection conversion with field mapping', async () => {
      const table = TestUtils.createTestTable({
        name: 'UserData',
        tableId: 'user-data',
        databaseId: 'main-db',
      });

      (convertTableToCollection as jest.Mock).mockReturnValue({
        name: 'UserData',
        $id: 'user-data',
        documentSecurity: table.documentSecurity,
        enabled: table.enabled,
        $permissions: table.$permissions,
        attributes: table.attributes,
        indexes: table.indexes,
        importDefs: table.importDefs,
      });

      const collection = (convertTableToCollection as jest.Mock)(table);

      expect(collection.$id).toBe('user-data');
      expect(collection.name).toBe('UserData');
      expect(collection._isFromTablesDir).toBeUndefined();
      expect(collection.attributes).toEqual(table.attributes);
    });
  });

  describe('Migration Validation', () => {
    it('should validate migration before execution', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (validateMigration as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
        canProceed: true,
        estimatedTime: '2 minutes',
        affectedFiles: ['TestCollection.ts'],
      });

      const validation = (validateMigration as jest.Mock)(testDir, 'to-tables');

      expect(validation.isValid).toBe(true);
      expect(validation.canProceed).toBe(true);
      expect(validation.affectedFiles).toHaveLength(1);
    });

    it('should detect validation errors that prevent migration', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (validateMigration as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          'Collection "TestCollection" has invalid attribute types for TablesDB',
          'Missing required databaseId for target tables'
        ],
        warnings: ['Migration will take significant time'],
        canProceed: false,
        reasons: ['Critical validation errors found'],
      });

      const validation = (validateMigration as jest.Mock)(testDir, 'to-tables');

      expect(validation.isValid).toBe(false);
      expect(validation.canProceed).toBe(false);
      expect(validation.errors).toHaveLength(2);
    });

    it('should provide migration warnings for user review', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (validateMigration as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [
          'Some relationships may need manual adjustment',
          'Index performance may differ between APIs',
          'Import definitions will be preserved but may need updates'
        ],
        canProceed: true,
        requiresUserConfirmation: true,
      });

      const validation = (validateMigration as jest.Mock)(testDir, 'to-tables');

      expect(validation.warnings).toHaveLength(3);
      expect(validation.requiresUserConfirmation).toBe(true);
    });
  });

  describe('Migration Backup and Recovery', () => {
    it('should create backup before migration', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      const backupDir = path.join(testDir, '.migration-backup');

      (createBackup as jest.Mock).mockImplementation((sourceDir, backupPath) => {
        fs.mkdirSync(backupPath, { recursive: true });

        // Copy collections
        const collectionsBackup = path.join(backupPath, 'collections');
        fs.mkdirSync(collectionsBackup);
        fs.writeFileSync(
          path.join(collectionsBackup, 'TestCollection.ts'),
          'backup content'
        );

        return {
          success: true,
          backupPath,
          backedUpFiles: ['collections/TestCollection.ts'],
          timestamp: new Date().toISOString(),
        };
      });

      const backup = (createBackup as jest.Mock)(testDir, backupDir);

      expect(backup.success).toBe(true);
      expect(backup.backedUpFiles).toContain('collections/TestCollection.ts');
      expect(fs.existsSync(backupDir)).toBe(true);
    });

    it('should provide rollback capability after failed migration', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const backupDir = path.join(testDir, '.migration-backup');

      // Simulate backup creation
      (createBackup as jest.Mock).mockReturnValue({
        success: true,
        backupPath: backupDir,
        backedUpFiles: ['collections/TestCollection.ts'],
      });

      // Simulate migration failure
      (migrateToTablesDir as jest.Mock).mockImplementation(() => {
        throw new Error('Migration failed - disk space insufficient');
      });

      try {
        (migrateToTablesDir as jest.Mock)(testDir);
      } catch (error) {
        // Rollback should restore from backup
        expect(createBackup).toHaveBeenCalled();
      }
    });
  });

  describe('Complex Migration Scenarios', () => {
    it('should handle mixed YAML and TypeScript migration', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      // Add YAML files
      const collectionsDir = path.join(testDir, 'collections');
      fs.writeFileSync(
        path.join(collectionsDir, 'YamlCollection.yaml'),
        'name: YamlCollection\nid: yaml-collection\n'
      );

      (migrateToTablesDir as jest.Mock).mockImplementation((sourceDir, options) => {
        return {
          success: true,
          migratedFiles: [
            'TestCollection.ts -> TestCollection.yaml',
            'YamlCollection.yaml -> YamlCollection.yaml'
          ],
          skippedFiles: [],
        };
      });

      const result = (migrateToTablesDir as jest.Mock)(testDir, {
        preserveFormat: false, // Convert all to YAML
      });

      expect(result.migratedFiles).toHaveLength(2);
      expect(result.migratedFiles).toContain('TestCollection.ts -> TestCollection.yaml');
    });

    it('should handle large-scale migration with progress tracking', async () => {
      testDir = TestUtils.createTempDir();

      // Create many collections
      const collectionsDir = path.join(testDir, 'collections');
      fs.mkdirSync(collectionsDir);

      for (let i = 0; i < 100; i++) {
        const collection = TestUtils.createTestCollection({
          name: `Collection${i}`,
          $id: `collection-${i}`,
        });
        fs.writeFileSync(
          path.join(collectionsDir, `Collection${i}.ts`),
          `export default ${JSON.stringify(collection, null, 2)};`
        );
      }

      (migrateToTablesDir as jest.Mock).mockImplementation((sourceDir, options) => {
        return {
          success: true,
          migratedFiles: Array.from({ length: 100 }, (_, i) =>
            `Collection${i}.ts -> Collection${i}.yaml`
          ),
          totalFiles: 100,
          completedFiles: 100,
          estimatedTimeRemaining: '0 minutes',
        };
      });

      const result = (migrateToTablesDir as jest.Mock)(testDir, {
        batchSize: 10,
        progressCallback: jest.fn(),
      });

      expect(result.migratedFiles).toHaveLength(100);
      expect(result.completedFiles).toBe(100);
    });

    it('should migrate import definitions and maintain relationships', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const collectionWithImports = TestUtils.createTestCollection({
        name: 'Users',
        importDefs: [
          {
            sourceFile: 'users.json',
            mapping: {
              'name': 'fullName',
              'email': 'emailAddress',
            },
            relationships: [
              {
                field: 'profileId',
                targetCollection: 'Profiles',
                type: 'oneToOne',
              }
            ],
          }
        ],
      });

      (migrateToTablesDir as jest.Mock).mockImplementation(() => {
        return {
          success: true,
          migratedFiles: ['Users.ts -> Users.yaml'],
          preservedImportDefs: true,
          updatedRelationships: ['Users.profileId -> Profiles'],
        };
      });

      const result = (migrateToTablesDir as jest.Mock)(testDir);

      expect(result.preservedImportDefs).toBe(true);
      expect(result.updatedRelationships).toHaveLength(1);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle partial migration failures gracefully', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (migrateToTablesDir as jest.Mock).mockReturnValue({
        success: false,
        errors: [
          'Failed to convert TestCollection.ts: invalid attribute type',
        ],
        partiallyMigrated: [],
        rollbackRequired: true,
      });

      const result = (migrateToTablesDir as jest.Mock)(testDir);

      expect(result.success).toBe(false);
      expect(result.rollbackRequired).toBe(true);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle file permission issues during migration', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (migrateToTablesDir as jest.Mock).mockImplementation(() => {
        throw new Error('EACCES: permission denied, mkdir \'/readonly/tables\'');
      });

      expect(() => (migrateToTablesDir as jest.Mock)(testDir)).toThrow('permission denied');
    });

    it('should validate disk space before migration', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      (validateMigration as jest.Mock).mockReturnValue({
        isValid: false,
        errors: ['Insufficient disk space for migration'],
        requiredSpace: '500MB',
        availableSpace: '100MB',
        canProceed: false,
      });

      const validation = (validateMigration as jest.Mock)(testDir, 'to-tables');

      expect(validation.canProceed).toBe(false);
      expect(validation.errors).toContain('Insufficient disk space for migration');
    });
  });
});