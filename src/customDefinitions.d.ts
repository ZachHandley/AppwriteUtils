// src/customDefinitions.d.ts
declare module "customDefinitions" {
  import {
    ConverterFunctions,
    ValidationRules,
    AfterImportActions,
  } from "./main.js";

  export const converterDefinitions: ConverterFunctions;
  export const validityRuleDefinitions: ValidationRules;
  export const afterImportActionsDefinitions: AfterImportActions;
}
