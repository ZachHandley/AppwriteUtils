import { Permission as AppwritePermission } from "appwrite";
import { z } from "zod";

export const permissionSchema = z
  .object({
    permission: z.string(),
    target: z.string(),
  })
  .or(
    z.string().transform((val) => {
      const trimmedVal = val.trim();
      // Adjusted regex to match double quotes
      const match = trimmedVal.match(/^(\w+)\("([^"]+)"\)$/);
      if (!match) {
        throw new Error(`Invalid permission format: ${trimmedVal}`);
      }
      return {
        permission: match[1],
        target: match[2],
      };
    })
  );

export const permissionsSchema = z.array(permissionSchema).optional();

export type Permission = z.infer<typeof permissionSchema>;
export type Permissions = z.infer<typeof permissionsSchema>;

export const PermissionToAppwritePermission = (permissions: Permissions): string[] => {
  return permissions?.map(p => {
    if (typeof p === 'string') {
      return p;
    } else {
      switch (p.permission) {
        case "read":
          return AppwritePermission.read(p.target);
        case "create":
          return AppwritePermission.create(p.target);
        case "update":
          return AppwritePermission.update(p.target);
        case "delete":
          return AppwritePermission.delete(p.target);
        case "write":
          return AppwritePermission.write(p.target);
        default:
          console.log(`Unknown permission: ${p.permission}`);
          return '';
      }
    }
  }).filter(p => p !== '') || [];
};