import { jest } from '@jest/globals';

// Mock winston logger to avoid log output during tests
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Mock chalk to avoid ANSI codes in tests
jest.mock('chalk', () => ({
  red: jest.fn((text) => text),
  green: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  blue: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  magenta: jest.fn((text) => text),
  white: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  bold: jest.fn((text) => text),
  dim: jest.fn((text) => text),
  italic: jest.fn((text) => text),
  underline: jest.fn((text) => text),
  strikethrough: jest.fn((text) => text),
  bgRed: jest.fn((text) => text),
  bgGreen: jest.fn((text) => text),
  bgYellow: jest.fn((text) => text),
  bgBlue: jest.fn((text) => text),
  bgCyan: jest.fn((text) => text),
  bgMagenta: jest.fn((text) => text),
  bgWhite: jest.fn((text) => text),
}));

// Mock inquirer to avoid interactive prompts during tests
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

// Set up global test timeout
jest.setTimeout(30000);

// Clean up environment variables before each test
beforeEach(() => {
  // Reset any environment variables that might affect tests
  delete process.env.APPWRITE_ENDPOINT;
  delete process.env.APPWRITE_PROJECT;
  delete process.env.APPWRITE_KEY;
});