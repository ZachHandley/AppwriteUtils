import { Client, Users, type Models } from "node-appwrite";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

// Concurrency limits — mirror FunctionManager style
const userLimit = pLimit(5);    // Moderate limit for user write operations
const queryLimit = pLimit(25);  // Higher limit for read operations

export interface CreateUserParams {
  userId: string;
  email?: string;
  phone?: string;
  password?: string;
  name?: string;
}

export interface UpdateUserParams {
  name?: string;
  email?: string;
  phone?: string;
  status?: boolean;
  emailVerification?: boolean;
  phoneVerification?: boolean;
  labels?: string[];
  password?: string;
  prefs?: object;
}

/**
 * Manager wrapping the node-appwrite v23 `Users` server-side service.
 *
 * Reads are funneled through `queryLimit` (concurrency 25) and writes through
 * `userLimit` (concurrency 5). All SDK calls are retried via `tryAwaitWithRetry`.
 */
export class UsersManager {
  private client: Client;
  private users: Users;

  constructor(client: Client) {
    this.client = client;
    this.users = new Users(client);
  }

  /**
   * List users with optional Appwrite Query strings and a free-text search.
   * Filter attributes: name, email, phone, status, passwordUpdate, registration,
   * emailVerification, phoneVerification, labels, impersonator.
   */
  public async listUsers(
    queries?: string[],
    search?: string
  ): Promise<Models.UserList<Models.Preferences>> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { queries?: string[]; search?: string } = {};
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.users.list<Models.Preferences>(params);
      })
    );
  }

  /**
   * Get a single user by ID.
   */
  public async getUser(userId: string): Promise<Models.User<Models.Preferences>> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.users.get<Models.Preferences>({ userId })
      )
    );
  }

  /**
   * Create a new user. All auth fields are optional — Appwrite v23 supports
   * empty users that can be filled in later.
   */
  public async createUser(params: CreateUserParams): Promise<Models.User<Models.Preferences>> {
    return await userLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.users.create<Models.Preferences>({
          userId: params.userId,
          email: params.email,
          phone: params.phone,
          password: params.password,
          name: params.name,
        })
      )
    );
  }

  /**
   * Patch any subset of user fields. Internally dispatches to the correct
   * underlying SDK method per field. Order is stable: name → email → phone →
   * status → emailVerification → phoneVerification → labels → password → prefs.
   *
   * Returns the latest user record (or refetches it if only `prefs` was patched,
   * since `updatePrefs` returns a Preferences object rather than a full User).
   */
  public async updateUser(
    userId: string,
    params: UpdateUserParams
  ): Promise<Models.User<Models.Preferences>> {
    return await userLimit(async () => {
      let user: Models.User<Models.Preferences> | undefined;

      if (params.name !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updateName<Models.Preferences>({ userId, name: params.name as string })
        );
      }
      if (params.email !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updateEmail<Models.Preferences>({ userId, email: params.email as string })
        );
      }
      if (params.phone !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updatePhone<Models.Preferences>({ userId, number: params.phone as string })
        );
      }
      if (params.status !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updateStatus<Models.Preferences>({ userId, status: params.status as boolean })
        );
      }
      if (params.emailVerification !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updateEmailVerification<Models.Preferences>({
            userId,
            emailVerification: params.emailVerification as boolean,
          })
        );
      }
      if (params.phoneVerification !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updatePhoneVerification<Models.Preferences>({
            userId,
            phoneVerification: params.phoneVerification as boolean,
          })
        );
      }
      if (params.labels !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updateLabels<Models.Preferences>({
            userId,
            labels: params.labels as string[],
          })
        );
      }
      if (params.password !== undefined) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.updatePassword<Models.Preferences>({
            userId,
            password: params.password as string,
          })
        );
      }
      if (params.prefs !== undefined) {
        await tryAwaitWithRetry(async () =>
          await this.users.updatePrefs<Models.Preferences>({
            userId,
            prefs: params.prefs as object,
          })
        );
        user = undefined; // force refetch to capture canonical user record
      }

      // If nothing was patched, or only prefs was patched, refetch the user
      // so callers always get the latest full record.
      if (!user) {
        user = await tryAwaitWithRetry(async () =>
          await this.users.get<Models.Preferences>({ userId })
        );
      }

      return user;
    });
  }

  /**
   * Delete a user by ID.
   */
  public async deleteUser(userId: string): Promise<void> {
    await userLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.users.delete({ userId });
      })
    );
  }

  /**
   * Update a user's password (plain text, min 8 chars). Wraps `updatePassword`.
   */
  public async updatePassword(
    userId: string,
    password: string
  ): Promise<Models.User<Models.Preferences>> {
    return await userLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.users.updatePassword<Models.Preferences>({ userId, password })
      )
    );
  }

  /**
   * Activate (`true`) or block (`false`) a user account.
   */
  public async updateStatus(
    userId: string,
    status: boolean
  ): Promise<Models.User<Models.Preferences>> {
    return await userLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.users.updateStatus<Models.Preferences>({ userId, status })
      )
    );
  }

  /**
   * List a user's active sessions.
   */
  public async listSessions(userId: string): Promise<Models.SessionList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => await this.users.listSessions({ userId }))
    );
  }

  /**
   * Delete a single session for a user.
   */
  public async deleteSession(userId: string, sessionId: string): Promise<void> {
    await userLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.users.deleteSession({ userId, sessionId });
      })
    );
  }

  /**
   * Delete ALL sessions for a user (effectively a force-logout).
   */
  public async deleteSessions(userId: string): Promise<void> {
    await userLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.users.deleteSessions({ userId });
      })
    );
  }

  /**
   * List a user's team memberships. Filter attributes: userId, teamId, invited,
   * joined, confirm, roles.
   */
  public async listMemberships(
    userId: string,
    queries?: string[]
  ): Promise<Models.MembershipList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { userId: string; queries?: string[] } = { userId };
        if (queries && queries.length > 0) params.queries = queries;
        return await this.users.listMemberships(params);
      })
    );
  }

  /**
   * List identities across all users. Filter attributes: userId, provider,
   * providerUid, providerEmail, providerAccessTokenExpiry.
   */
  public async listIdentities(
    queries?: string[],
    search?: string
  ): Promise<Models.IdentityList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { queries?: string[]; search?: string } = {};
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.users.listIdentities(params);
      })
    );
  }

  /**
   * Get a user's preferences object.
   */
  public async getPrefs(userId: string): Promise<Models.Preferences> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.users.getPrefs<Models.Preferences>({ userId })
      )
    );
  }

  /**
   * Replace a user's preferences object (max 64kB). Note: this REPLACES, it
   * does not merge.
   */
  public async updatePrefs(
    userId: string,
    prefs: object
  ): Promise<Models.Preferences> {
    return await userLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.users.updatePrefs<Models.Preferences>({ userId, prefs })
      )
    );
  }
}
