import { Client, Teams, type Models } from "node-appwrite";
import pLimit from "p-limit";
import { tryAwaitWithRetry } from "../utils/helperFunctions.js";

// Concurrency limits — mirror FunctionManager style.
const teamLimit = pLimit(5);   // Moderate limit for team write operations
const queryLimit = pLimit(25); // Higher limit for read operations

/**
 * Parameters for creating a new team.
 */
export interface CreateTeamParams {
  teamId: string;
  name: string;
  roles?: string[];
}

/**
 * Parameters for creating a new team membership.
 *
 * At least one of `email`, `userId`, or `phone` must be provided.
 */
export interface CreateTeamMembershipParams {
  teamId: string;
  email?: string;
  userId?: string;
  phone?: string;
  roles: string[];
  url?: string;
  name?: string;
}

/**
 * High-level wrapper around the node-appwrite `Teams` service. Provides
 * convenient promise-based methods backed by the standard
 * `tryAwaitWithRetry` retry helper and shared concurrency limiters.
 */
export class TeamsManager {
  private client: Client;
  private teams: Teams;

  constructor(client: Client) {
    this.client = client;
    this.teams = new Teams(client);
  }

  // ──────────────────────────────────────────────────
  // Teams
  // ──────────────────────────────────────────────────

  /**
   * List teams visible to the current credentials. Supports Appwrite query
   * strings and an optional free-text search term (max 256 chars).
   */
  public async listTeams(
    queries?: string[],
    search?: string
  ): Promise<Models.TeamList<Models.Preferences>> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { queries?: string[]; search?: string } = {};
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.teams.list<Models.Preferences>(params);
      })
    );
  }

  /**
   * Get a team by its unique ID.
   */
  public async getTeam(
    teamId: string
  ): Promise<Models.Team<Models.Preferences>> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.get<Models.Preferences>({ teamId })
      )
    );
  }

  /**
   * Create a new team. Choose a custom `teamId` or generate one with
   * `ID.unique()`. The optional `roles` array sets the creator's roles
   * (default is `owner`).
   */
  public async createTeam(
    params: CreateTeamParams
  ): Promise<Models.Team<Models.Preferences>> {
    return await teamLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.create<Models.Preferences>({
          teamId: params.teamId,
          name: params.name,
          ...(params.roles && params.roles.length > 0 ? { roles: params.roles } : {}),
        })
      )
    );
  }

  /**
   * Update a team's name. Backed by Teams.updateName.
   */
  public async updateTeam(
    teamId: string,
    name: string
  ): Promise<Models.Team<Models.Preferences>> {
    return await teamLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.updateName<Models.Preferences>({ teamId, name })
      )
    );
  }

  /**
   * Delete a team by its unique ID. Only members with the `owner` role
   * can delete a team.
   */
  public async deleteTeam(teamId: string): Promise<void> {
    await teamLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.teams.delete({ teamId });
      })
    );
  }

  /**
   * Get the team's shared preferences.
   */
  public async getPrefs(teamId: string): Promise<Models.Preferences> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.getPrefs<Models.Preferences>({ teamId })
      )
    );
  }

  /**
   * Replace the team's shared preferences. The object you pass replaces
   * any previous value. Max allowed prefs size is 64kB.
   */
  public async updatePrefs(
    teamId: string,
    prefs: object
  ): Promise<Models.Preferences> {
    return await teamLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.updatePrefs<Models.Preferences>({ teamId, prefs })
      )
    );
  }

  // ──────────────────────────────────────────────────
  // Memberships
  // ──────────────────────────────────────────────────

  /**
   * List a team's members. Supports Appwrite query strings and an optional
   * free-text search term (max 256 chars).
   */
  public async listMemberships(
    teamId: string,
    queries?: string[],
    search?: string
  ): Promise<Models.MembershipList> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () => {
        const params: { teamId: string; queries?: string[]; search?: string } = { teamId };
        if (queries && queries.length > 0) params.queries = queries;
        if (search && search.trim().length > 0) params.search = search;
        return await this.teams.listMemberships(params);
      })
    );
  }

  /**
   * Get a single team membership by ID.
   */
  public async getMembership(
    teamId: string,
    membershipId: string
  ): Promise<Models.Membership> {
    return await queryLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.getMembership({ teamId, membershipId })
      )
    );
  }

  /**
   * Invite or add a member to a team. Provide at least one of `email`,
   * `userId`, or `phone` — Appwrite resolves them in that priority order
   * when multiple are supplied. The `roles` array is required.
   */
  public async createMembership(
    params: CreateTeamMembershipParams
  ): Promise<Models.Membership> {
    if (!params.email && !params.userId && !params.phone) {
      throw new Error(
        "createMembership requires at least one of email, userId, or phone"
      );
    }

    return await teamLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.createMembership({
          teamId: params.teamId,
          roles: params.roles,
          ...(params.email ? { email: params.email } : {}),
          ...(params.userId ? { userId: params.userId } : {}),
          ...(params.phone ? { phone: params.phone } : {}),
          ...(params.url ? { url: params.url } : {}),
          ...(params.name ? { name: params.name } : {}),
        })
      )
    );
  }

  /**
   * Modify the roles of a team member. Only team members with the `owner`
   * role have access to this operation.
   */
  public async updateMembership(
    teamId: string,
    membershipId: string,
    roles: string[]
  ): Promise<Models.Membership> {
    return await teamLimit(() =>
      tryAwaitWithRetry(async () =>
        await this.teams.updateMembership({ teamId, membershipId, roles })
      )
    );
  }

  /**
   * Remove a team membership. Allows a user to leave a team or an owner
   * to remove any member (including non-accepted invites).
   */
  public async deleteMembership(
    teamId: string,
    membershipId: string
  ): Promise<void> {
    await teamLimit(() =>
      tryAwaitWithRetry(async () => {
        await this.teams.deleteMembership({ teamId, membershipId });
      })
    );
  }
}
