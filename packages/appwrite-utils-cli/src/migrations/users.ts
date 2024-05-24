import type { AppwriteConfig, ConfigCollection } from "appwrite-utils";
import {
  AppwriteException,
  Databases,
  ID,
  Query,
  Users,
  type Models,
} from "node-appwrite";
import {
  AuthUserSchema,
  type AuthUser,
  type AuthUserCreate,
} from "../schemas/authUser.js";
import _ from "lodash";
import { logger } from "./logging.js";
import { splitIntoBatches } from "./migrationHelper.js";
import {
  getAppwriteClient,
  tryAwaitWithRetry,
} from "../utils/helperFunctions.js";

export class UsersController {
  private config: AppwriteConfig;
  private users: Users;
  static userFields = [
    "email",
    "name",
    "password",
    "phone",
    "labels",
    "prefs",
    "userId",
    "$createdAt",
    "$updatedAt",
  ];

  constructor(config: AppwriteConfig, db: Databases) {
    this.config = config;
    this.users = new Users(this.config.appwriteClient!);
  }

  async wipeUsers() {
    const allUsers = await this.getAllUsers();
    console.log("Deleting all users...");

    const createBatches = (finalData: any[], batchSize: number) => {
      const finalBatches: any[][] = [];
      for (let i = 0; i < finalData.length; i += batchSize) {
        finalBatches.push(finalData.slice(i, i + batchSize));
      }
      return finalBatches;
    };

    let usersDeleted = 0;
    const batchedUserPromises = createBatches(allUsers, 50); // Batch size of 10

    for (const batch of batchedUserPromises) {
      console.log(`Deleting ${batch.length} users...`);
      await Promise.all(
        batch.map((user) =>
          tryAwaitWithRetry(async () => await this.users.delete(user.$id))
        )
      );
      usersDeleted += batch.length;
      if (usersDeleted % 100 === 0) {
        console.log(`Deleted ${usersDeleted} users...`);
      }
    }
  }

  async getAllUsers() {
    const allUsers: Models.User<Models.Preferences>[] = [];
    const users = await tryAwaitWithRetry(
      async () => await this.users.list([Query.limit(200)])
    );
    if (users.users.length === 0) {
      return [];
    }
    if (users.users.length === 200) {
      let lastDocumentId = users.users[users.users.length - 1].$id;
      allUsers.push(...users.users);
      while (lastDocumentId) {
        const moreUsers = await tryAwaitWithRetry(
          async () =>
            await this.users.list([
              Query.limit(200),
              Query.cursorAfter(lastDocumentId),
            ])
        );
        allUsers.push(...moreUsers.users);
        lastDocumentId = moreUsers.users[moreUsers.users.length - 1].$id;
        if (moreUsers.users.length < 200) {
          break;
        }
      }
    } else {
      allUsers.push(...users.users);
    }
    return allUsers;
  }

  async createUsersAndReturn(items: AuthUserCreate[]) {
    const users = await Promise.all(
      items.map((item) => this.createUserAndReturn(item))
    );
    return users;
  }

  async createUserAndReturn(item: AuthUserCreate, numAttempts?: number) {
    try {
      const user = await this.users.create(
        item.userId || ID.unique(),
        item.email || undefined,
        item.phone && item.phone.length < 15 && item.phone.startsWith("+")
          ? item.phone
          : undefined,
        `changeMe${item.email?.toLowerCase()}` || `changeMePlease`,
        item.name || undefined
      );
      if (item.labels) {
        await this.users.updateLabels(user.$id, item.labels);
      }
      if (item.prefs) {
        await this.users.updatePrefs(user.$id, item.prefs);
      }
      return user;
    } catch (e) {
      if (e instanceof AppwriteException) {
        if (
          e.message.toLowerCase().includes("fetch failed") ||
          e.message.toLowerCase().includes("server error")
        ) {
          const numberOfAttempts = numAttempts || 0;
          if (numberOfAttempts > 5) {
            throw e;
          }
          const user: Models.User<Models.Preferences> =
            await this.createUserAndReturn(item, numberOfAttempts + 1);
          return user;
        }
      }
      if (e instanceof Error) {
        logger.error("FAILED CREATING USER: ", e.message);
      }
      console.log("FAILED CREATING USER: ", e);
      throw e;
    }
  }

  async createAndCheckForUserAndReturn(item: AuthUserCreate) {
    let userToReturn: Models.User<Models.Preferences> | undefined = undefined;
    try {
      // Attempt to find an existing user by email or phone.
      let foundUsers: Models.User<Models.Preferences>[] = [];
      if (item.email) {
        const foundUsersByEmail = await this.users.list([
          Query.equal("email", item.email),
        ]);
        foundUsers = foundUsersByEmail.users;
      }
      if (item.phone) {
        const foundUsersByPhone = await this.users.list([
          Query.equal("phone", item.phone),
        ]);
        foundUsers = foundUsers.length
          ? foundUsers.concat(foundUsersByPhone.users)
          : foundUsersByPhone.users;
      }

      userToReturn = foundUsers[0] || undefined;

      if (!userToReturn) {
        userToReturn = await this.users.create(
          item.userId || ID.unique(),
          item.email || undefined,
          item.phone && item.phone.length < 15 && item.phone.startsWith("+")
            ? item.phone
            : undefined,
          item.password?.toLowerCase() ||
            `changeMe${item.email?.toLowerCase()}` ||
            `changeMePlease`,
          item.name || undefined
        );
      } else {
        // Update user details as necessary, ensuring email uniqueness if attempting an update.
        if (
          item.email &&
          item.email !== userToReturn.email &&
          !_.isEmpty(item.email) &&
          !_.isUndefined(item.email)
        ) {
          const emailExists = await this.users.list([
            Query.equal("email", item.email),
          ]);
          if (emailExists.users.length === 0) {
            userToReturn = await this.users.updateEmail(
              userToReturn.$id,
              item.email
            );
          } else {
            console.log("Email update skipped: Email already exists.");
          }
        }
        if (item.password) {
          userToReturn = await this.users.updatePassword(
            userToReturn.$id,
            item.password.toLowerCase()
          );
        }
        if (item.name && item.name !== userToReturn.name) {
          userToReturn = await this.users.updateName(
            userToReturn.$id,
            item.name
          );
        }
        if (
          item.phone &&
          item.phone !== userToReturn.phone &&
          item.phone.length < 15 &&
          item.phone.startsWith("+") &&
          (_.isUndefined(userToReturn.phone) || _.isEmpty(userToReturn.phone))
        ) {
          const userFoundWithPhone = await this.users.list([
            Query.equal("phone", item.phone),
          ]);
          if (userFoundWithPhone.total === 0) {
            userToReturn = await this.users.updatePhone(
              userToReturn.$id,
              item.phone
            );
          }
        }
      }
      if (item.$createdAt && item.$updatedAt) {
        console.log(
          "$createdAt and $updatedAt are not yet supported, sorry about that!"
        );
      }
      if (item.labels && item.labels.length) {
        userToReturn = await this.users.updateLabels(
          userToReturn.$id,
          item.labels
        );
      }
      if (item.prefs && Object.keys(item.prefs).length) {
        await this.users.updatePrefs(userToReturn.$id, item.prefs);
        userToReturn.prefs = item.prefs;
      }
      return userToReturn;
    } catch (error) {
      return userToReturn;
    }
  }

  async getUserIdByEmailOrPhone(email?: string, phone?: string) {
    if (!email && !phone) {
      return undefined;
    }
    if (email && phone) {
      const foundUsersByEmail = await this.users.list([
        // @ts-ignore
        Query.or([Query.equal("email", email), Query.equal("phone", phone)]),
      ]);
      if (foundUsersByEmail.users.length > 0) {
        return foundUsersByEmail.users[0]?.$id;
      }
    } else if (email) {
      const foundUsersByEmail = await this.users.list([
        Query.equal("email", email),
      ]);
      if (foundUsersByEmail.users.length > 0) {
        return foundUsersByEmail.users[0]?.$id;
      } else {
        if (!phone) {
          return undefined;
        } else {
          const foundUsersByPhone = await this.users.list([
            Query.equal("phone", phone),
          ]);
          if (foundUsersByPhone.users.length > 0) {
            return foundUsersByPhone.users[0]?.$id;
          } else {
            return undefined;
          }
        }
      }
    }
    if (phone) {
      const foundUsersByPhone = await this.users.list([
        Query.equal("phone", phone),
      ]);
      if (foundUsersByPhone.users.length > 0) {
        return foundUsersByPhone.users[0]?.$id;
      } else {
        return undefined;
      }
    }
  }

  transferUsersBetweenDbsLocalToRemote = async (
    endpoint: string,
    projectId: string,
    apiKey: string
  ) => {
    const localUsers = this.users;
    const client = getAppwriteClient(endpoint, projectId, apiKey);
    const remoteUsers = new Users(client);

    let fromUsers = await localUsers.list([Query.limit(50)]);

    if (fromUsers.users.length === 0) {
      console.log(`No users found`);
      return;
    } else if (fromUsers.users.length < 50) {
      console.log(`Transferring ${fromUsers.users.length} users to remote`);
      const batchedPromises = fromUsers.users.map((user) => {
        return tryAwaitWithRetry(async () => {
          const toCreateObject: Partial<typeof user> = {
            ...user,
          };
          delete toCreateObject.$id;
          delete toCreateObject.$createdAt;
          delete toCreateObject.$updatedAt;
          await remoteUsers.create(
            user.$id,
            user.email,
            user.phone,
            user.password,
            user.name
          );
        });
      });
      await Promise.all(batchedPromises);
    } else {
      while (fromUsers.users.length === 50) {
        fromUsers = await localUsers.list([
          Query.limit(50),
          Query.cursorAfter(fromUsers.users[fromUsers.users.length - 1].$id),
        ]);
        const batchedPromises = fromUsers.users.map((user) => {
          return tryAwaitWithRetry(async () => {
            const toCreateObject: Partial<typeof user> = {
              ...user,
            };
            delete toCreateObject.$id;
            delete toCreateObject.$createdAt;
            delete toCreateObject.$updatedAt;
            await remoteUsers.create(
              user.$id,
              user.email,
              user.phone,
              user.password,
              user.name
            );
          });
        });
        await Promise.all(batchedPromises);
      }
    }
  };
}
