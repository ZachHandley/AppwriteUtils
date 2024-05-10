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
