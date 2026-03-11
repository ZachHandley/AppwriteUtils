import os
from appwrite.client import Client
from context import AppwriteContext, AppwriteHeaders, AppwriteRequestModel

def main(context: AppwriteContext):
    req = context.req
    res = context.res
    log = context.log
    error = context.error

    # Optional: Validate request headers using Pydantic
    try:
        headers = AppwriteHeaders.model_validate(req.headers)
        log("Headers validation successful")
    except Exception as validation_error:
        error(f"Headers validation failed: {validation_error}")

    # Optional: Validate full request using Pydantic model
    try:
        request_model = AppwriteRequestModel.model_validate({
            'method': req.method,
            'headers': req.headers,
            'path': req.path,
            'url': req.url,
            'body': req.body,
            'bodyText': req.bodyText,
            'bodyJson': req.bodyJson
        })
        log("Request validation successful")
    except Exception as validation_error:
        error(f"Request validation failed: {validation_error}")

    client = Client()
    client.set_endpoint(os.getenv('APPWRITE_FUNCTION_ENDPOINT'))
    client.set_project(os.getenv('APPWRITE_FUNCTION_PROJECT_ID'))
    client.set_key(os.getenv('APPWRITE_FUNCTION_API_KEY'))

    log(f"Processing {req.method} request to {req.path}")

    return res.json({
        'message': 'Hello from Python function!',
        'functionName': '{{functionName}}',
        'method': req.method,
        'path': req.path,
        'headers': req.headers
    })