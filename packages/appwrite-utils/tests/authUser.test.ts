import { describe, expect, test } from "bun:test";

import { AuthUserCreateSchema, AuthUserSchema } from "../src/schemas/authUser.js";

// Regression: under zod >= 4.6 the old empty-shape schema threw at import time.
describe("AuthUser schemas", () => {
  test("create schema keeps the picked fields instead of stripping them", () => {
    const parsed = AuthUserCreateSchema.parse({
      email: "a@example.com",
      password: "hunter22",
      name: "A",
      phone: "+15555550100",
      labels: ["x"],
      prefs: { theme: "dark" },
      $id: "ignored",
    });
    expect(parsed).toEqual({
      email: "a@example.com",
      password: "hunter22",
      name: "A",
      phone: "+15555550100",
      labels: ["x"],
      prefs: { theme: "dark" },
    });
  });

  test("user schema requires $id and applies defaults", () => {
    expect(AuthUserSchema.safeParse({}).success).toBe(false);
    expect(AuthUserSchema.parse({ $id: "u1" })).toEqual({ $id: "u1", prefs: {}, labels: [] });
  });
});
