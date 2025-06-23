from appwrite.client import Client

def main(context):
    req = context.req
    res = context.res
    log = context.log
    error = context.error

    client = Client()
    client.set_endpoint(req.env['APPWRITE_FUNCTION_ENDPOINT'])
    client.set_project(req.env['APPWRITE_FUNCTION_PROJECT_ID'])
    client.set_key(req.env['APPWRITE_FUNCTION_API_KEY'])

    return res.json({
        'message': 'Hello from Python function!'
    })