export type AuthErrorCode =
  | 'session-required'
  | 'session-invalid'
  | 'session-expired'
  | 'session-endpoint-mismatch'
  | 'apikey-required'
  | 'no-auth-available';

export interface AuthErrorDetails {
  endpoint?: string;
  projectId?: string;
  suggestion?: string;
  availableSessions?: Array<{ projectId: string; email?: string }>;
}

export class AuthenticationError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly details: AuthErrorDetails = {}
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }

  getFormattedMessage(): string {
    const parts: string[] = [];

    // 1. Error code in brackets
    parts.push(`[${this.code}] ${this.message}`);

    // 2. Available sessions if present
    if (this.details.availableSessions && this.details.availableSessions.length > 0) {
      parts.push('\nAvailable sessions:');
      this.details.availableSessions.forEach((session, index) => {
        const sessionInfo = session.email
          ? `${session.projectId} (${session.email})`
          : session.projectId;
        parts.push(`  ${index + 1}. ${sessionInfo}`);
      });
    }

    // 3. Suggestion if present
    if (this.details.suggestion) {
      parts.push(`\nSuggestion: ${this.details.suggestion}`);
    }

    return parts.join('\n');
  }
}
