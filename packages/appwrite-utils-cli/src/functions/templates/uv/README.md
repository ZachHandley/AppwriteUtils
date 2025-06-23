# Python UV Function Template

This is a Python template for Appwrite Functions using UV for fast dependency management.

## Structure
- `src/index.py`: Main function entry point
- `pyproject.toml`: UV/PyPI project configuration and dependencies

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
1. Install UV: `curl -LsSf https://astral.sh/uv/install.sh | sh`
2. Install dependencies: `uv sync`
3. Run locally: `uv run python src/index.py`
4. Deploy: Dependencies will be installed during deployment

## Deployment
Make sure it's inside `appwriteConfig.yaml` functions array, and if you want to install dependencies FIRST, before Appwrite (using your system), you can
add the `predeployCommands` to the function in `appwriteConfig.yaml`.