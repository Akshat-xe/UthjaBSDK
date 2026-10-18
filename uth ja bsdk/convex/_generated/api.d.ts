/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as mobileSnapshots from "../mobileSnapshots.js";
import type * as mobileSyncRequests from "../mobileSyncRequests.js";
import type * as phoneActionValidation from "../phoneActionValidation.js";
import type * as phoneActions from "../phoneActions.js";
import type * as radarCloud from "../radarCloud.js";
import type * as radarUnstop from "../radarUnstop.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  mobileSnapshots: typeof mobileSnapshots;
  mobileSyncRequests: typeof mobileSyncRequests;
  phoneActionValidation: typeof phoneActionValidation;
  phoneActions: typeof phoneActions;
  radarCloud: typeof radarCloud;
  radarUnstop: typeof radarUnstop;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
