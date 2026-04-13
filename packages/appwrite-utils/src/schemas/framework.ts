import { z } from "zod";

export const FrameworkSchema = z.enum([
  "analog",
  "angular",
  "nextjs",
  "react",
  "nuxt",
  "vue",
  "sveltekit",
  "astro",
  "tanstack-start",
  "remix",
  "lynx",
  "flutter",
  "react-native",
  "vite",
  "other",
]);

export type Framework = z.infer<typeof FrameworkSchema>;
