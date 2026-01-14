"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Syncs the Clerk user to Convex database on authentication
 * This component should be placed in the root layout
 */
export function UserSync() {
  const { user, isLoaded } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [syncing, setSyncing] = useState(false);
  const hasSynced = useRef(false);

  useEffect(() => {
    // Only sync if:
    // 1. Clerk user is loaded
    // 2. User exists in Clerk
    // 3. User doesn't exist in Convex yet (or we haven't synced yet)
    // 4. We're not currently syncing
    // 5. We haven't already successfully synced
    if (isLoaded && user && currentUser === null && !syncing && !hasSynced.current) {
      setSyncing(true);
      syncUser({
        clerkId: user.id,
        email: user.primaryEmailAddress?.emailAddress || "",
        name: user.fullName || undefined,
        imageUrl: user.imageUrl || undefined,
      })
        .then(() => {
          console.log("✅ User synced successfully");
          hasSynced.current = true;
        })
        .catch((error) => {
          console.error("❌ Failed to sync user:", error);
          // Reset syncing state so it can retry
          setSyncing(false);
        })
        .finally(() => {
          setSyncing(false);
        });
    }

    // Mark as synced if user already exists
    if (currentUser !== undefined && currentUser !== null) {
      hasSynced.current = true;
    }
  }, [user, isLoaded, syncUser, syncing, currentUser]);

  return null;
}
