import type { AppwriteConfig } from "appwrite-utils";
import {
  validateCollectionsTablesConfig,
  reportValidationResults,
  type ValidationResult as BaseValidationResult,
  type ValidationError as BaseValidationError
} from "../configValidation.js";
import { MessageFormatter } from "../../shared/messageFormatter.js";
import { logger } from "../../shared/logging.js";

/**
 * Re-export types from configValidation for convenience
 */
export type ValidationError = BaseValidationError;

/**
 * Warning-level validation issue (non-blocking)
 */
export interface ValidationWarning extends BaseValidationError {
  severity: "warning";
}

/**
 * Complete validation result including errors, warnings, and suggestions
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions?: ValidationError[];
}

/**
 * Options for validation reporting
 */
export interface ValidationReportOptions {
  /**
   * Include detailed information in the report
   * @default false
   */
  verbose?: boolean;

  /**
   * Suppress console output (only log to file)
   * @default false
   */
  silent?: boolean;

  /**
   * Exit process if validation fails
   * @default false
   */
  exitOnError?: boolean;
}

/**
 * Service for validating Appwrite configuration with support for multiple validation modes
 *
 * This service provides centralized configuration validation with:
 * - Standard validation (warnings allowed)
 * - Strict validation (warnings treated as errors)
 * - Detailed error reporting with suggestions
 * - Configurable output verbosity
 *
 * @example
 * ```typescript
 * const validationService = new ConfigValidationService();
 *
 * // Standard validation
 * const result = validationService.validate(config);
 * if (!result.isValid) {
 *   validationService.reportResults(result, { verbose: true });
 * }
 *
 * // Strict validation (warnings become errors)
 * const strictResult = validationService.validateStrict(config);
 * if (!strictResult.isValid) {
 *   throw new Error("Configuration validation failed in strict mode");
 * }
 * ```
 */
export class ConfigValidationService {
  /**
   * Validate configuration with standard rules
   *
   * Standard validation allows warnings - the configuration is considered valid
   * even if warnings are present. Only errors cause validation to fail.
   *
   * Validation checks include:
   * - Basic structure validation (required fields, array structure)
   * - Naming conflict detection (collections vs tables)
   * - Database reference validation
   * - Schema consistency validation
   * - Duplicate definition detection
   *
   * @param config - Appwrite configuration to validate
   * @returns Validation result with errors, warnings, and suggestions
   *
   * @example
   * ```typescript
   * const result = validationService.validate(config);
   *
   * if (result.isValid) {
   *   console.log("Configuration is valid");
   *   if (result.warnings.length > 0) {
   *     console.log(`Found ${result.warnings.length} warnings`);
   *   }
   * } else {
   *   console.error(`Configuration has ${result.errors.length} errors`);
   * }
   * ```
   */
  public validate(config: AppwriteConfig): ValidationResult {
    logger.debug("Starting configuration validation (standard mode)");

    try {
      const baseResult = validateCollectionsTablesConfig(config);

      const result: ValidationResult = {
        isValid: baseResult.isValid,
        errors: baseResult.errors,
        warnings: baseResult.warnings as ValidationWarning[],
        suggestions: baseResult.suggestions
      };

      logger.debug("Configuration validation complete", {
        isValid: result.isValid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        suggestionCount: result.suggestions?.length || 0
      });

      return result;
    } catch (error) {
      logger.error("Configuration validation failed with exception", {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [
          {
            type: "schema_inconsistency",
            message: "Configuration validation failed",
            details: error instanceof Error ? error.message : String(error),
            suggestion: "Check configuration file for syntax errors or invalid structure",
            severity: "error"
          }
        ],
        warnings: []
      };
    }
  }

  /**
   * Validate configuration with strict rules
   *
   * Strict validation treats all warnings as errors. This is useful for:
   * - CI/CD pipelines (fail builds on any issues)
   * - Production deployments (ensure highest quality)
   * - Configuration audits (enforce best practices)
   *
   * All warnings are promoted to errors, so the configuration is only
   * considered valid if there are zero warnings and zero errors.
   *
   * @param config - Appwrite configuration to validate
   * @returns Validation result with promoted warnings as errors
   *
   * @example
   * ```typescript
   * const result = validationService.validateStrict(config);
   *
   * if (!result.isValid) {
   *   console.error("Configuration failed strict validation");
   *   result.errors.forEach(err => {
   *     console.error(`  - ${err.message}`);
   *   });
   *   process.exit(1);
   * }
   * ```
   */
  public validateStrict(config: AppwriteConfig): ValidationResult {
    logger.debug("Starting configuration validation (strict mode)");

    try {
      const baseResult = validateCollectionsTablesConfig(config);

      // In strict mode, promote all warnings to errors
      const promotedWarnings: ValidationError[] = baseResult.warnings.map(warning => ({
        ...warning,
        severity: "error" as const
      }));

      const allErrors = [...baseResult.errors, ...promotedWarnings];

      const result: ValidationResult = {
        isValid: allErrors.length === 0,
        errors: allErrors,
        warnings: [], // No warnings in strict mode - all promoted to errors
        suggestions: baseResult.suggestions
      };

      logger.debug("Configuration validation complete (strict mode)", {
        isValid: result.isValid,
        errorCount: result.errors.length,
        promotedWarnings: promotedWarnings.length,
        suggestionCount: result.suggestions?.length || 0
      });

      return result;
    } catch (error) {
      logger.error("Configuration validation failed with exception (strict mode)", {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [
          {
            type: "schema_inconsistency",
            message: "Configuration validation failed in strict mode",
            details: error instanceof Error ? error.message : String(error),
            suggestion: "Check configuration file for syntax errors or invalid structure",
            severity: "error"
          }
        ],
        warnings: []
      };
    }
  }

  /**
   * Report validation results to console with formatted output
   *
   * Provides user-friendly formatting of validation results:
   * - Color-coded output (errors in red, warnings in yellow, etc.)
   * - Detailed error descriptions with suggestions
   * - Affected items listing
   * - Optional verbose mode for additional details
   *
   * @param validation - Validation result to report
   * @param options - Reporting options (verbose, silent, exitOnError)
   *
   * @example
   * ```typescript
   * const result = validationService.validate(config);
   *
   * // Basic reporting
   * validationService.reportResults(result);
   *
   * // Verbose reporting with all details
   * validationService.reportResults(result, { verbose: true });
   *
   * // Report and exit on error (useful for scripts)
   * validationService.reportResults(result, { exitOnError: true });
   * ```
   */
  public reportResults(
    validation: ValidationResult,
    options: ValidationReportOptions = {}
  ): void {
    const { verbose = false, silent = false, exitOnError = false } = options;

    if (silent) {
      // Only log to file, don't print to console
      logger.info("Configuration validation results", {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        suggestionCount: validation.suggestions?.length || 0
      });

      if (validation.errors.length > 0) {
        validation.errors.forEach(error => {
          logger.error("Validation error", {
            type: error.type,
            message: error.message,
            details: error.details,
            suggestion: error.suggestion,
            affectedItems: error.affectedItems
          });
        });
      }

      return;
    }

    // Use existing reportValidationResults for formatted console output
    reportValidationResults(
      {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        suggestions: validation.suggestions || []
      },
      { verbose }
    );

    // Exit on error if requested
    if (exitOnError && !validation.isValid) {
      logger.error("Exiting due to validation errors");
      process.exit(1);
    }
  }

  /**
   * Validate and report in a single call
   *
   * Convenience method that combines validation and reporting.
   * Useful for quick validation checks in CLI commands.
   *
   * @param config - Appwrite configuration to validate
   * @param strict - Use strict validation mode
   * @param reportOptions - Reporting options
   * @returns Validation result
   *
   * @example
   * ```typescript
   * // Quick validation with reporting
   * const result = validationService.validateAndReport(config, false, {
   *   verbose: true,
   *   exitOnError: true
   * });
   * ```
   */
  public validateAndReport(
    config: AppwriteConfig,
    strict: boolean = false,
    reportOptions: ValidationReportOptions = {}
  ): ValidationResult {
    const result = strict ? this.validateStrict(config) : this.validate(config);
    this.reportResults(result, reportOptions);
    return result;
  }

  /**
   * Check if configuration is valid without detailed reporting
   *
   * Quick validation check that returns a simple boolean.
   * Useful for conditional logic where you don't need detailed error information.
   *
   * @param config - Appwrite configuration to validate
   * @param strict - Use strict validation mode
   * @returns true if configuration is valid, false otherwise
   *
   * @example
   * ```typescript
   * if (validationService.isValid(config)) {
   *   // Proceed with configuration
   * } else {
   *   // Show error and prompt for correction
   * }
   * ```
   */
  public isValid(config: AppwriteConfig, strict: boolean = false): boolean {
    const result = strict ? this.validateStrict(config) : this.validate(config);
    return result.isValid;
  }

  /**
   * Get a summary of validation results as a formatted string
   *
   * Returns a human-readable summary of validation results suitable for
   * logging or display in UIs.
   *
   * @param validation - Validation result to summarize
   * @returns Formatted summary string
   *
   * @example
   * ```typescript
   * const result = validationService.validate(config);
   * const summary = validationService.getSummary(result);
   * console.log(summary);
   * // Output: "Configuration valid with 2 warnings, 1 suggestion"
   * ```
   */
  public getSummary(validation: ValidationResult): string {
    if (validation.isValid) {
      const parts = ["Configuration valid"];

      if (validation.warnings.length > 0) {
        parts.push(`${validation.warnings.length} warning${validation.warnings.length > 1 ? "s" : ""}`);
      }

      if (validation.suggestions && validation.suggestions.length > 0) {
        parts.push(`${validation.suggestions.length} suggestion${validation.suggestions.length > 1 ? "s" : ""}`);
      }

      return parts.join(" with ");
    } else {
      return `Configuration invalid: ${validation.errors.length} error${validation.errors.length > 1 ? "s" : ""}`;
    }
  }
}
