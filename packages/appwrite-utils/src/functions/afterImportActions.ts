import { type AppwriteConfig } from "../schemas/appwriteConfig";
export interface AfterImportActions {
  [key: string]: (config: AppwriteConfig, ...args: any[]) => Promise<any>;
}
