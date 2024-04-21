import type { AppwriteConfig, ConfigCollection } from "./schema.js";
import { Databases, ID, Query, Users, type Models } from "node-appwrite";
import {
  AuthUserSchema,
  type AuthUser,
  type AuthUserCreate,
} from "../schemas/authUser.js";
import _ from "lodash";
import { logger } from "./logging.js";
import { splitIntoBatches } from "./migrationHelper.js";

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
    const users = await this.users.list([Query.limit(200)]);
    const allUsers = users.users;
    let lastDocumentId: string | undefined;
    if (users.users.length >= 200) {
      lastDocumentId = users.users[users.users.length - 1].$id;
    }
    while (lastDocumentId) {
      const moreUsers = await this.users.list([
        Query.limit(200),
        Query.cursorAfter(lastDocumentId),
      ]);
      allUsers.push(...moreUsers.users);
      if (moreUsers.users.length < 200) {
        break;
      }
      lastDocumentId = moreUsers.users[moreUsers.users.length - 1].$id;
    }
    console.log("Deleting all users...");
    const createBatches = (finalData: any[]) => {
      let maxBatchLength = 5;
      const finalBatches: any[][] = [];
      for (let i = 0; i < finalData.length; i++) {
        if (i % maxBatchLength === 0) {
          finalBatches.push([]);
        }
        finalBatches[finalBatches.length - 1].push(finalData[i]);
      }
      return finalBatches;
    };
    // const userPromises: Promise<string>[] = [];
    let usersDeleted = 0;
    for (const user of allUsers) {
      await this.users.delete(user.$id);
      usersDeleted++;
      if (usersDeleted % 100 === 0) {
        console.log(`Deleted ${usersDeleted} users...`);
      }
    }
    // const batchedUserPromises = createBatches(userPromises);
    // for (const batch of batchedUserPromises) {
    //   console.log(`Deleting ${batch.length} users...`);
    //   await Promise.all(batch);
    // }
  }

  async getAllUsers() {
    const allUsers: Models.User<Models.Preferences>[] = [];
    const users = await this.users.list([Query.limit(200)]);
    if (users.users.length === 200) {
      let lastDocumentId = users.users[users.users.length - 1].$id;
      allUsers.push(...users.users);
      while (lastDocumentId) {
        const moreUsers = await this.users.list([
          Query.limit(200),
          Query.cursorAfter(lastDocumentId),
        ]);
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

  async createUserAndReturn(item: AuthUserCreate) {
    try {
      const user = await this.users.create(
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
      if (item.labels) {
        await this.users.updateLabels(user.$id, item.labels);
      }
      if (item.prefs) {
        await this.users.updatePrefs(user.$id, item.prefs);
      }
      return user;
    } catch (e) {
      if (e instanceof Error) {
        logger.error("FAILED CREATING USER: ", e.message);
      }
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
}
