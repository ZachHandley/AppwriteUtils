// AUTO-GENERATED from Appwrite OpenAPI spec at main. DO NOT EDIT.
// Source: https://github.com/appwrite/appwrite/tree/main/app/config/specs
import { z } from "zod";

const PlatformJsonSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "$id": {
      "type": "string",
      "x-example": "5e5ea5c16897e",
      "description": "Platform ID."
    },
    "$createdAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Platform creation date in ISO 8601 format."
    },
    "$updatedAt": {
      "type": "string",
      "x-example": "2020-10-15T06:38:00.000+00:00",
      "description": "Platform update date in ISO 8601 format."
    },
    "name": {
      "type": "string",
      "x-example": "My Web App",
      "description": "Platform name."
    },
    "type": {
      "type": "string",
      "enum": [
        "web",
        "flutter-web",
        "flutter-ios",
        "flutter-android",
        "flutter-linux",
        "flutter-macos",
        "flutter-windows",
        "apple-ios",
        "apple-macos",
        "apple-watchos",
        "apple-tvos",
        "android",
        "unity",
        "react-native-ios",
        "react-native-android"
      ],
      "x-example": "web",
      "description": "Platform type. Possible values are: web, flutter-web, flutter-ios, flutter-android, flutter-linux, flutter-macos, flutter-windows, apple-ios, apple-macos, apple-watchos, apple-tvos, android, unity, react-native-ios, react-native-android."
    },
    "key": {
      "type": "string",
      "x-example": "com.company.appname",
      "description": "Platform Key. iOS bundle ID or Android package name.  Empty string for other platforms."
    },
    "store": {
      "type": "string",
      "x-example": "",
      "description": "App store or Google Play store ID."
    },
    "hostname": {
      "type": "string",
      "x-example": "app.example.com",
      "description": "Web app hostname. Empty string for other platforms."
    },
    "httpUser": {
      "type": "string",
      "x-example": "username",
      "description": "HTTP basic authentication username."
    },
    "httpPass": {
      "type": "string",
      "x-example": "password",
      "description": "HTTP basic authentication password."
    }
  },
  "required": [
    "$id",
    "$createdAt",
    "$updatedAt",
    "name",
    "type",
    "key",
    "store",
    "hostname",
    "httpUser",
    "httpPass"
  ],
  "additionalProperties": {},
  "example": {
    "$id": "5e5ea5c16897e",
    "$createdAt": "2020-10-15T06:38:00.000+00:00",
    "$updatedAt": "2020-10-15T06:38:00.000+00:00",
    "name": "My Web App",
    "type": "web",
    "key": "com.company.appname",
    "store": "",
    "hostname": "app.example.com",
    "httpUser": "username",
    "httpPass": "password"
  },
  "description": "Platform"
} as const;

export const PlatformSchema = z.fromJSONSchema(PlatformJsonSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
export type Platform = z.infer<typeof PlatformSchema>;
