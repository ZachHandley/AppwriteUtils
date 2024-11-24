# Count Documents in Collection Function

A utility function that accurately counts documents in an Appwrite collection, even when there are more than 5,000 documents.

## Features
- Handles collections with any number of documents
- Supports filtering using Appwrite queries
- Uses efficient binary search algorithm for large collections
- Provides detailed logging during the counting process

## Structure
- `src/main.ts`: Main function implementation with counting logic
- `src/request.ts`: Request validation schema using Zod

## Usage
Send a POST request with:
```json
{
  "databaseId": "your-database-id",
  "collectionId": "your-collection-id",
  "queries": [Query.orderDesc("$createdAt"), Query.contains("name", "John")] // Or put the string array from after this, they are the same
}
```

## Response
```json
{
  "success": true,
  "count": 12345
}
```

## Development
1. Install dependencies: `npm|yarn|bun install`
2. Build: `npm|yarn|bun run build`
3. Deploy: Function will be built automatically during deployment

## Deployment
Make sure it's inside `appwriteConfig.ts` functions array, and if you want to build it FIRST, before Appwrite (using your system), you can
add the `predeployCommands` to the function in `appwriteConfig.ts`.

## Example Config
```typescript
{
  $id: 'count-docs',
  name: 'Count Documents',
  runtime: 'node-18.0',
  path: 'functions/count-docs',
  entrypoint: './main.js',
  execute: ['any'],
  predeployCommands: ['npm install', 'npm run build'],
  deployDir: './dist'
}
```