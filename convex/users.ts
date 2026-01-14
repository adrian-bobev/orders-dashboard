import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuth } from "./lib/authorization";

/**
 * Syncs a Clerk user to the Convex database
 * Called on user login/signup
 * First user becomes admin, subsequent users become viewer
 */
export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existingUser) {
      // Update existing user (but don't change role or isActive)
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
      });
      return existingUser._id;
    }

    // Check if this is the first user (they become admin)
    const userCount = await ctx.db.query("users").collect();
    const isFirstUser = userCount.length === 0;

    // Create new user
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      role: isFirstUser ? "admin" : "viewer",
      isActive: true,
    });

    return userId;
  },
});

/**
 * Gets the current authenticated user's data
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireAuth(ctx);
    } catch {
      return null;
    }
  },
});

/**
 * Lists all active users (admin only)
 */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Updates a user's role (admin only)
 * Prevents users from changing their own role
 */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireAdmin(ctx);

    // Prevent users from changing their own role
    if (currentUser._id === args.userId) {
      throw new Error("Cannot change your own role");
    }

    // Get target user
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    if (!targetUser.isActive) {
      throw new Error("Cannot modify inactive user");
    }

    // Update role
    await ctx.db.patch(args.userId, {
      role: args.newRole,
    });

    return { success: true };
  },
});

/**
 * Soft deletes a user (admin only)
 * Sets isActive to false
 * Prevents users from removing themselves
 */
export const removeUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const currentUser = await requireAdmin(ctx);

    // Prevent users from removing themselves
    if (currentUser._id === args.userId) {
      throw new Error("Cannot remove yourself");
    }

    // Get target user
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Soft delete
    await ctx.db.patch(args.userId, {
      isActive: false,
    });

    return { success: true };
  },
});
