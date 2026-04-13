import { z } from "zod";

export const AdapterSchema = z.enum(["static", "ssr"]);

export type Adapter = z.infer<typeof AdapterSchema>;
