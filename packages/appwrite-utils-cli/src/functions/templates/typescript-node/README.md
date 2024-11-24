# TypeScript Node.js Function Template

This is a TypeScript template for Appwrite Functions using Node.js runtime.

## Structure
- `src/index.ts`: Main function entry point
- `src/appwriteRequest.ts`: Type definitions for Appwrite request object
- `src/appwriteResponse.ts`: Type definitions for Appwrite response object

## Usage
Your function will receive:
- `req`: AppwriteRequest object containing request data, headers, and environment variables
- `res`: AppwriteResponse object for sending responses
- `log`: Function for logging (shows in your function logs)
- `error`: Function for error logging

## Example Request
```json
{
  "databaseId": "your-database-id",
  "collectionId": "your-collection-id"
}
```

## Development
1. Install dependencies: `npm|yarn|bun install`
2. Build: `npm|yarn|bun run build`
3. Deploy: Function will be built automatically during deployment

## Deployment
Make sure it's inside `appwriteConfig.ts` functions array, and if you want to build it FIRST, before Appwrite (using your system), you can
add the `predeployCommands` to the function in `appwriteConfig.ts` -- for an example, see `count-docs-in-collection` function.