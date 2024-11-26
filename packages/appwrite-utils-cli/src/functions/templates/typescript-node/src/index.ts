import { Client } from "node-appwrite";
import { AppwriteRequest, type AppwriteResponse } from "appwrite-utils";

export default async function ({
  req,
  res,
  log,
  error,
}: {
  req: AppwriteRequest;
  res: AppwriteResponse;
  log: (message: string) => void;
  error: (message: string) => void;
}) {
  const client = new Client()
    .setEndpoint(process.env["APPWRITE_FUNCTION_ENDPOINT"]!)
    .setProject(process.env["APPWRITE_FUNCTION_PROJECT_ID"]!)
    .setKey(req.headers["x-appwrite-key"] || "");

  return res.json({
    message: "Hello from TypeScript function!",
  });
}
