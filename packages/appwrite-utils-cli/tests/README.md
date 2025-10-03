# Testing Framework for Dual Schema Implementation

## Overview

This testing framework provides comprehensive coverage for the dual schema architecture, ensuring reliability, performance, and compatibility across different Appwrite versions and configuration scenarios.

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests with coverage
npm test:coverage

# Run tests in watch mode during development
npm test:watch

# Run tests for CI/CD
npm test:ci
```

## Test Structure

```
tests/
├── README.md                   # This file
├── setup.ts                    # Global test setup and mocks
├── testUtils.ts                # Shared utilities and helpers
├── jest.config.js              # Jest configuration
├── utils/                      # Unit tests for utilities
│   └── loadConfigs.test.ts     # Configuration loading tests
├── adapters/                   # Adapter system tests
│   └── AdapterFactory.test.ts  # Adapter creation and selection
├── integration/                # Integration and E2E tests
│   └── syncOperations.test.ts  # Sync operations testing
├── validation/                 # Configuration validation tests
│   └── configValidation.test.ts
├── migration/                  # Migration utilities tests
│   └── configMigration.test.ts
└── fixtures/                   # Test data and configurations
    ├── collections/
    ├── tables/
    └── configs/
```

## Test Categories

### 1. Unit Tests (`utils/`, `adapters/`)

**Purpose**: Test individual functions and classes in isolation

**Coverage**:
- Configuration loading logic
- YAML/TypeScript parsing
- Adapter factory patterns
- Version detection algorithms
- Validation functions

**Example**:
```typescript
describe('loadConfig', () => {
  it('should load dual directories correctly', async () => {
    const testDir = TestUtils.createTestProject({
      hasCollections: true,
      hasTables: true,
    });

    const config = await loadConfig(testDir);

    expect(config.collections).toHaveLength(2);
    expect(config.collections.some(c => c._isFromTablesDir)).toBe(true);
  });
});
```

### 2. Integration Tests (`integration/`)

**Purpose**: Test complete workflows and system interactions

**Coverage**:
- End-to-end sync operations
- API version compatibility
- File system operations
- Network error handling
- Performance under load

**Example**:
```typescript
describe('Sync Operations', () => {
  it('should sync from Appwrite to local configuration', async () => {
    mockAdapter.getDatabases.mockResolvedValue([mockDatabase]);
    mockAdapter.getCollections.mockResolvedValue([mockCollection]);

    await mockAdapter.syncFromAppwrite(testDir);

    expect(fs.existsSync(path.join(testDir, 'collections'))).toBe(true);
  });
});
```

### 3. Validation Tests (`validation/`)

**Purpose**: Test configuration validation and error detection

**Coverage**:
- Schema validation
- Naming conflict detection
- API compatibility checks
- Strict mode behavior
- Error reporting

**Example**:
```typescript
describe('Configuration Validation', () => {
  it('should detect naming conflicts', async () => {
    const mockValidation = {
      isValid: false,
      errors: [{
        type: 'naming_conflict',
        message: 'Duplicate name found between directories',
      }],
    };

    const result = await loadConfigWithPath(testDir, { validate: true });

    expect(result.validation.errors).toHaveLength(1);
  });
});
```

### 4. Migration Tests (`migration/`)

**Purpose**: Test configuration migration utilities

**Coverage**:
- Migration detection logic
- TypeScript to YAML conversion
- Directory structure changes
- Backup and rollback procedures
- Large-scale migrations

**Example**:
```typescript
describe('Migration Operations', () => {
  it('should migrate collections to tables directory', async () => {
    const result = migrateToTablesDir(testDir, {
      preserveOriginal: true,
      convertToYaml: true,
    });

    expect(result.success).toBe(true);
    expect(result.migratedFiles).toHaveLength(1);
  });
});
```

## Test Utilities

### TestUtils Class

Central utility class for creating test environments:

```typescript
class TestUtils {
  // Directory Management
  static createTempDir(): string
  static createTestProject(options): string
  static cleanup(): void

  // Configuration Creation
  static createTestAppwriteConfig(overrides): AppwriteConfig
  static createTestCollection(overrides): CollectionCreate
  static createTestTable(overrides): TableCreate

  // Mock Generation
  static createMockAppwriteResponses(): MockClient
}
```

### Usage Examples

```typescript
// Create a test project with both collections and tables
const testDir = TestUtils.createTestProject({
  hasCollections: true,
  hasTables: true,
  hasConflicts: true,  // Test naming conflicts
  useYaml: true,       // Use YAML format
});

// Create mock configurations
const mockConfig = TestUtils.createTestAppwriteConfig({
  appwriteProject: 'test-project',
  databases: [{ name: 'test-db', $id: 'test-db-id' }],
});

// Automatic cleanup after tests
afterEach(() => {
  TestUtils.cleanup();
});
```

## Mocking Strategy

### Global Mocks (setup.ts)

```typescript
// Mock external dependencies
jest.mock('winston');           // Logging
jest.mock('chalk');            // Terminal colors
jest.mock('inquirer');         // Interactive prompts
jest.mock('cli-progress');     // Progress bars

// Mock file system operations when needed
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));
```

### Adapter Mocking

```typescript
// Mock adapter responses
const mockAdapter = {
  syncFromAppwrite: jest.fn(),
  syncToAppwrite: jest.fn(),
  getDatabases: jest.fn().mockResolvedValue([mockDatabase]),
  getCollections: jest.fn().mockResolvedValue([mockCollection]),
  validateConfiguration: jest.fn().mockReturnValue({ isValid: true }),
};

(AdapterFactory.createAdapter as jest.Mock).mockResolvedValue(mockAdapter);
```

### Version Detection Mocking

```typescript
jest.mock('../../src/utils/versionDetection', () => ({
  detectAppwriteVersionCached: jest.fn().mockResolvedValue({
    serverVersion: '1.6.0',
    apiMode: 'database',
  }),
  isVersionAtLeast: jest.fn((version, target) => version >= target),
}));
```

## Performance Testing

### Load Testing

```typescript
describe('Performance Tests', () => {
  it('should handle large configurations efficiently', async () => {
    // Create 500 collections + 300 tables
    const largeConfig = createLargeConfiguration(500, 300);

    const startTime = Date.now();
    await loadConfig(testDir);
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000); // 5 second max
  });
});
```

### Memory Testing

```typescript
describe('Memory Usage', () => {
  it('should not leak memory during repeated operations', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform many operations
    for (let i = 0; i < 100; i++) {
      await loadConfig(testDir);
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const increase = finalMemory - initialMemory;

    expect(increase).toBeLessThan(50 * 1024 * 1024); // 50MB max
  });
});
```

## Error Testing

### Network Errors

```typescript
describe('Network Error Handling', () => {
  it('should handle API timeout gracefully', async () => {
    mockAdapter.getDatabases.mockRejectedValue(
      new Error('Request timeout')
    );

    await expect(syncFromAppwrite(testDir))
      .rejects.toThrow('Request timeout');
  });
});
```

### File System Errors

```typescript
describe('File System Errors', () => {
  it('should handle permission denied errors', async () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    await expect(saveConfiguration(config, testDir))
      .rejects.toThrow('permission denied');
  });
});
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Test Dual Schema
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

### Coverage Requirements

- **Overall**: 90%+ coverage
- **Statements**: 90%+
- **Branches**: 85%+
- **Functions**: 95%+
- **Lines**: 90%+

## Debugging Tests

### Running Specific Tests

```bash
# Run single test file
npm test loadConfigs.test.ts

# Run specific test pattern
npm test -- --testNamePattern="dual schema"

# Run with verbose output
npm test -- --verbose

# Run with coverage for specific files
npm test -- --coverage --collectCoverageOnlyFrom="src/utils/loadConfigs.ts"
```

### Debug Mode

```bash
# Run with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Debug single test
node --inspect-brk node_modules/.bin/jest --runInBand --testNamePattern="should load dual directories"
```

### VSCode Debug Configuration

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Best Practices

### Test Organization

1. **Group Related Tests**: Use `describe` blocks to group related functionality
2. **Descriptive Names**: Test names should clearly describe the expected behavior
3. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification
4. **Clean State**: Each test should start with a clean state

### Mock Management

1. **Clear Mocks**: Always clear mocks between tests
2. **Realistic Data**: Use realistic mock data that represents actual usage
3. **Error Scenarios**: Mock both success and failure scenarios
4. **External Dependencies**: Mock all external dependencies (APIs, file system, etc.)

### Performance Considerations

1. **Parallel Execution**: Use Jest's parallel execution for faster test runs
2. **Selective Testing**: Use test patterns to run only relevant tests during development
3. **Resource Cleanup**: Always clean up resources (temp files, network connections)
4. **Timeout Management**: Set appropriate timeouts for async operations

### Test Data Management

1. **Fixtures**: Use fixture files for complex test data
2. **Factories**: Use factory functions for generating test objects
3. **Randomization**: Use random data where appropriate to catch edge cases
4. **Reproducibility**: Ensure tests are deterministic and reproducible

## Troubleshooting

### Common Issues

#### "Jest encountered an unexpected token"
```bash
# Solution: Check Jest configuration for TypeScript
npm install --save-dev ts-jest @types/jest
```

#### "Module not found" errors
```bash
# Solution: Check import paths and ensure files exist
# Use absolute imports when necessary
```

#### "Tests are hanging"
```bash
# Solution: Check for unresolved promises or open handles
npm test -- --detectOpenHandles --forceExit
```

#### "Memory leaks detected"
```bash
# Solution: Ensure proper cleanup in afterEach/afterAll
# Check for unclosed file handles or timers
```

### Performance Issues

#### Slow test execution
```bash
# Solution: Run tests in parallel (default) or identify slow tests
npm test -- --verbose --runInBand  # Serial execution for debugging
```

#### High memory usage
```bash
# Solution: Clear mocks and clean up test data
# Use smaller test datasets
# Check for memory leaks in test utilities
```

## Contributing

### Adding New Tests

1. **Follow Naming Convention**: `*.test.ts` for test files
2. **Use TestUtils**: Leverage shared utilities for consistency
3. **Add Documentation**: Document complex test scenarios
4. **Update Coverage**: Ensure new code has appropriate test coverage

### Test Categories

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **Performance Tests**: Test system performance and scalability
- **Error Tests**: Test error handling and edge cases

This testing framework ensures the dual schema implementation is robust, reliable, and performs well across all supported scenarios and environments.