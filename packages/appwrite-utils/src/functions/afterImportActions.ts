import { type AppwriteConfig } from "../schemas/appwriteConfig.js";
export interface AfterImportActions {
  [key: string]: (config: AppwriteConfig, ...args: any[]) => Promise<any>;
}
