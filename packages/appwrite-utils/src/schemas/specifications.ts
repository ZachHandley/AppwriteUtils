import { z } from "zod";

const SPECIFICATIONS = {
  HALF_CPU_HALF_GIG_RAM: "s-0.5vcpu-512mb",
  ONE_CPU_HALF_GIG_RAM: "s-1vcpu-512mb",
  ONE_CPU_ONE_GIG_RAM: "s-1vcpu-1gb",
  TWO_CPU_TWO_GIG_RAM: "s-2vcpu-2gb",
  TWO_CPU_FOUR_GIG_RAM: "s-2vcpu-4gb",
  FOUR_CPU_FOUR_GIG_RAM: "s-4vcpu-4gb",
  FOUR_CPU_EIGHT_GIG_RAM: "s-4vcpu-8gb",
  EIGHT_CPU_FOUR_GIG_RAM: "s-8vcpu-4gb",
  EIGHT_CPU_EIGHT_GIG_RAM: "s-8vcpu-8gb",
} as const;

export const SpecificationSchema = z.nativeEnum(SPECIFICATIONS);

export type Specification = z.infer<typeof SpecificationSchema>;