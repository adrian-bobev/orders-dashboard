import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

/**
 * Gets the current authenticated user from Convex
 * @throws Error if not authenticated or user not found in database
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user) {
    throw new Error("User not found in database");
  }

  if (!user.isActive) {
    throw new Error("Account is inactive");
  }

  return user;
}

/**
 * Gets the current user and ensures they have admin role
 * @throws Error if not authenticated, user not found, or not an admin
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await requireAuth(ctx);

  if (user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required");
  }

  return user;
}

/**
 * Gets the current user and ensures they are active
 * @throws Error if not authenticated or account is inactive
 */
export async function requireActiveUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return await requireAuth(ctx);
}
