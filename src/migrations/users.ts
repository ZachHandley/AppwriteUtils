import type { AppwriteConfig, ConfigCollection } from "./schema.js";
import { Databases, ID, Query, Users } from "node-appwrite";
import {
  AuthUserSchema,
  type AuthUser,
  type AuthUserCreate,
} from "../schemas/authUser.js";

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
    const users = await this.users.list([Query.limit(25)]);
    const allUsers = users.users;
    let lastDocumentId: string | undefined;
    if (users.total > 25) {
      lastDocumentId = users.users[users.users.length - 1].$id;
    }
    while (lastDocumentId) {
      const moreUsers = await this.users.list([
        Query.limit(25),
        Query.cursorAfter(lastDocumentId),
      ]);
      allUsers.push(...moreUsers.users);
      lastDocumentId = moreUsers.users[moreUsers.users.length - 1].$id;
    }
    console.log("Deleting all users");
    for (const user of allUsers) {
      await this.users.delete(user.$id);
    }
  }

  async createUserAndReturn(item: AuthUserCreate) {
    console.log("Creating user with item", item);
    const foundUsers = await this.users.list([
      Query.equal("email", item.email),
    ]);
    let userToReturn = foundUsers.users[0] || undefined;
    if (!userToReturn) {
      console.log("Creating user cause not found");
      userToReturn = await this.users.create(
        item.userId || ID.unique(),
        item.email,
        item.phone,
        item.password?.toLowerCase() || `changeMe${item.email}`.toLowerCase(),
        item.name
      );
    } else {
      console.log("Updating user cause found");
      if (item.email && item.email !== userToReturn.email) {
        userToReturn = await this.users.updateEmail(
          userToReturn.$id,
          item.email
        );
      }
      if (item.password) {
        userToReturn = await this.users.updatePassword(
          userToReturn.$id,
          item.password.toLowerCase()
        );
      }
      if (item.name && item.name !== userToReturn.name) {
        userToReturn = await this.users.updateName(userToReturn.$id, item.name);
      }
      if (item.phone && item.phone !== userToReturn.phone) {
        userToReturn = await this.users.updatePhone(
          userToReturn.$id,
          item.phone
        );
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
      userToReturn = await this.users.updatePrefs(userToReturn.$id, item.prefs);
    }
    return userToReturn;
  }
}
