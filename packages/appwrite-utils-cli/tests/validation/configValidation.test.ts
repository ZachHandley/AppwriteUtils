import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import { TestUtils } from '../testUtils';
import { loadConfig, loadConfigWithPath } from '../../src/utils/loadConfigs';

// Mock validation functions
jest.mock('../../src/config/configValidation', () => ({
  validateCollectionsTablesConfig: jest.fn(),
  reportValidationResults: jest.fn(),
}));

import { validateCollectionsTablesConfig, reportValidationResults } from '../../src/config/configValidation';

describe('Configuration Validation Tests', () => {
  let testDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    TestUtils.cleanup();
  });

  describe('Basic Validation', () => {
    it('should validate configuration when validation is enabled', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(validateCollectionsTablesConfig).toHaveBeenCalledWith(result.config);
      expect(result.validation).toEqual(mockValidation);
      expect(reportValidationResults).toHaveBeenCalledWith(mockValidation, { verbose: true });
    });

    it('should skip validation when disabled', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const config = await loadConfig(testDir, { validate: false });

      expect(validateCollectionsTablesConfig).not.toHaveBeenCalled();
      expect(reportValidationResults).not.toHaveBeenCalled();
      expect(config).toBeDefined();
    });

    it('should report validation warnings', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'naming_convention',
            message: 'Collection name should use PascalCase',
            item: 'test-collection',
            severity: 'warning' as const,
          }
        ],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, {
        validate: true,
        reportValidation: true,
      });

      expect(result.validation?.warnings).toHaveLength(1);
      expect(reportValidationResults).toHaveBeenCalledWith(mockValidation, { verbose: true });
    });
  });

  describe('Strict Mode Validation', () => {
    it('should treat warnings as errors in strict mode', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'naming_convention',
            message: 'Collection name should use PascalCase',
            item: 'test-collection',
            severity: 'warning' as const,
          }
        ],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      await expect(
        loadConfigWithPath(testDir, {
          validate: true,
          strictMode: true,
        })
      ).rejects.toThrow('Configuration validation failed in strict mode');

      expect(validateCollectionsTablesConfig).toHaveBeenCalled();
    });

    it('should pass strict mode when no warnings', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, {
        validate: true,
        strictMode: true,
      });

      expect(result.validation?.isValid).toBe(true);
      expect(result.config).toBeDefined();
    });

    it('should fail strict mode on validation errors', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      const mockValidation = {
        isValid: false,
        errors: [
          {
            type: 'missing_required_field',
            message: 'Collection ID is required',
            item: 'test-collection',
            severity: 'error' as const,
          }
        ],
        warnings: [],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      await expect(
        loadConfigWithPath(testDir, {
          validate: true,
          strictMode: true,
        })
      ).rejects.toThrow('Configuration validation failed in strict mode');
    });
  });

  describe('Dual Schema Validation', () => {
    it('should validate naming conflicts between collections and tables', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
        hasConflicts: true,
      });

      const mockValidation = {
        isValid: false,
        errors: [
          {
            type: 'naming_conflict',
            message: 'Duplicate name found between collections/ and tables/ directories',
            item: 'TestCollection',
            severity: 'error' as const,
          }
        ],
        warnings: [],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.errors).toHaveLength(1);
      expect(result.validation?.errors[0].type).toBe('naming_conflict');
    });

    it('should validate table-specific fields', async () => {
      testDir = TestUtils.createTestProject({ hasTables: true });

      const mockValidation = {
        isValid: false,
        errors: [
          {
            type: 'missing_table_field',
            message: 'Table must have tableId and databaseId fields',
            item: 'test-table',
            severity: 'error' as const,
          }
        ],
        warnings: [],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.errors).toHaveLength(1);
      expect(result.validation?.errors[0].type).toBe('missing_table_field');
    });

    it('should validate attribute compatibility between APIs', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'api_compatibility',
            message: 'Some attributes may not be compatible between Database and TablesDB APIs',
            item: 'test-collection',
            severity: 'warning' as const,
          }
        ],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.warnings).toHaveLength(1);
      expect(result.validation?.warnings[0].type).toBe('api_compatibility');
    });
  });

  describe('YAML Validation', () => {
    it('should validate YAML schema compliance', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        useYaml: true,
      });

      const mockValidation = {
        isValid: false,
        errors: [
          {
            type: 'schema_validation',
            message: 'Invalid YAML schema: missing required field "name"',
            item: 'TestCollection.yaml',
            severity: 'error' as const,
          }
        ],
        warnings: [],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.errors).toHaveLength(1);
      expect(result.validation?.errors[0].type).toBe('schema_validation');
    });

    it('should validate mixed YAML and TypeScript configurations', async () => {
      testDir = TestUtils.createTestProject({ hasCollections: true });

      // Add YAML table
      const tablesDir = path.join(testDir, 'tables');
      fs.mkdirSync(tablesDir);
      fs.writeFileSync(
        path.join(tablesDir, 'YamlTable.yaml'),
        'name: YamlTable\ntableId: yaml-table\n'
      );

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'mixed_formats',
            message: 'Using both YAML and TypeScript configuration files',
            item: 'project',
            severity: 'warning' as const,
          }
        ],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.warnings).toHaveLength(1);
      expect(result.validation?.warnings[0].type).toBe('mixed_formats');
    });
  });

  describe('Performance Validation', () => {
    it('should handle validation of large configurations efficiently', async () => {
      testDir = TestUtils.createTempDir();

      // Create config with many collections
      const config = TestUtils.createTestAppwriteConfig();
      config.collections = Array.from({ length: 500 }, (_, i) =>
        TestUtils.createTestCollection({
          name: `Collection${i}`,
          $id: `collection-${i}`,
        })
      );

      fs.writeFileSync(
        path.join(testDir, 'appwriteConfig.ts'),
        `export default ${JSON.stringify(config, null, 2)};`
      );

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: Array.from({ length: 100 }, (_, i) => ({
          type: 'performance' as const,
          message: `Collection${i} could be optimized`,
          item: `collection-${i}`,
          severity: 'warning' as const,
        })),
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const startTime = Date.now();
      const result = await loadConfigWithPath(testDir, { validate: true });
      const validationTime = Date.now() - startTime;

      expect(validationTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.validation?.warnings).toHaveLength(100);
    });
  });

  describe('Migration Validation', () => {
    it('should validate configuration during migration from collections to dual schema', async () => {
      testDir = TestUtils.createTempDir();

      // Create legacy collections-only setup
      const config = TestUtils.createTestAppwriteConfig();
      fs.writeFileSync(
        path.join(testDir, 'appwriteConfig.ts'),
        `export default ${JSON.stringify(config, null, 2)};`
      );

      const collectionsDir = path.join(testDir, 'collections');
      fs.mkdirSync(collectionsDir);

      const collection = TestUtils.createTestCollection();
      fs.writeFileSync(
        path.join(collectionsDir, 'TestCollection.ts'),
        `export default ${JSON.stringify(collection, null, 2)};`
      );

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'migration_recommendation',
            message: 'Consider migrating to dual schema structure for better TablesDB support',
            item: 'project',
            severity: 'warning' as const,
          }
        ],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.warnings).toHaveLength(1);
      expect(result.validation?.warnings[0].type).toBe('migration_recommendation');
    });

    it('should validate that migrated configurations maintain compatibility', async () => {
      testDir = TestUtils.createTestProject({
        hasCollections: true,
        hasTables: true,
      });

      const mockValidation = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'compatibility_check',
            message: 'Verify that all collections work correctly with TablesDB API',
            item: 'TestCollection',
            severity: 'warning' as const,
          }
        ],
      };

      (validateCollectionsTablesConfig as jest.Mock).mockReturnValue(mockValidation);

      const result = await loadConfigWithPath(testDir, { validate: true });

      expect(result.validation?.warnings).toHaveLength(1);
      expect(result.validation?.warnings[0].type).toBe('compatibility_check');
    });
  });
});