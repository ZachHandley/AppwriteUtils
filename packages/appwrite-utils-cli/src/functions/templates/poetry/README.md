# Python Poetry Function Template

This is a Python template for Appwrite Functions using Poetry for dependency management.

## Structure
- `src/index.py`: Main function entry point
- `pyproject.toml`: Poetry configuration and dependencies

## Usage
Your function will receive a context object with:
- `req`: Request object containing request data, headers, and environment variables
- `res`: Response object for sending responses
- `log`: Function for logging (shows in your function logs)
- `error`: Function for error logging

## Example Request
```json
{
  "key": "value"
}
```

## Development
1. Install Poetry: `curl -sSL https://install.python-poetry.org | python3 -`
2. Install dependencies: `poetry install`
3. Deploy: Dependencies will be installed during deployment

## Deployment
Make sure it's inside `appwriteConfig.ts` functions array, and if you want to install dependencies FIRST, before Appwrite (using your system), you can
add the `predeployCommands` to the function in `appwriteConfig.ts`.