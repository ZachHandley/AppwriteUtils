import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'src', 'functions', 'templates');
const dest = join(process.cwd(), 'dist', 'functions', 'templates');

// Verify source exists
if (!existsSync(src)) {
  console.error('❌ Error: Template source directory not found:', src);
  process.exit(1);
}

// Create destination directory
mkdirSync(dest, { recursive: true });

// Copy templates recursively
try {
  cpSync(src, dest, { recursive: true });
  console.log('✓ Templates copied to dist/functions/templates/');
} catch (error) {
  console.error('❌ Failed to copy templates:', error);
  process.exit(1);
}
