import { z } from "zod";

/**
 * Function Specifications
 * 
 * s-0.5vcpu-512mb -- 0.5 vCPU, 512 MB RAM
 * 
 * s-1vcpu-512mb -- 1 vCPU, 512 MB RAM
 * 
 * s-1vcpu-1gb -- 1 vCPU, 1 GB RAM
 * 
 * s-2vcpu-2gb -- 2 vCPU, 2 GB RAM
 * 
 * s-2vcpu-4gb -- 2 vCPU, 4 GB RAM
 * 
 * s-4vcpu-4gb -- 4 vCPU, 4 GB RAM
 * 
 * s-4vcpu-8gb -- 4 vCPU, 8 GB RAM
 * 
 * s-8vcpu-4gb -- 8 vCPU, 4 GB RAM
 * 
 * s-8vcpu-8gb -- 8 vCPU, 8 GB RAM
 */
export const FunctionSpecifications = z.enum([
  "s-0.5vcpu-512mb",
  "s-1vcpu-512mb",
  "s-1vcpu-1gb",
  "s-2vcpu-2gb",
  "s-2vcpu-4gb",
  "s-4vcpu-4gb",
  "s-4vcpu-8gb",
  "s-8vcpu-4gb",
  "s-8vcpu-8gb",
]);

export type FunctionSpecification = z.infer<typeof FunctionSpecifications>;