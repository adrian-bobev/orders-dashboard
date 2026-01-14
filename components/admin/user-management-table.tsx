"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";

export function UserManagementTable() {
  const router = useRouter();
  const currentUser = useQuery(api.users.getCurrentUser);

  // Only fetch users list if we have a current user (authentication is ready)
  const users = useQuery(
    api.users.listUsers,
    currentUser !== undefined && currentUser !== null ? {} : "skip"
  );

  const updateUserRole = useMutation(api.users.updateUserRole);
  const removeUser = useMutation(api.users.removeUser);

  const [loadingUserId, setLoadingUserId] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if current user is loading
  if (currentUser === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Check if user is not found in database
  if (!currentUser) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading user data.</p>
      </div>
    );
  }

  // Check if users list is loading
  if (users === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (currentUser.role !== "admin") {
    router.push("/dashboard");
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          You do not have permission to access this page. Redirecting...
        </p>
      </div>
    );
  }

  const handleRoleChange = async (
    userId: Id<"users">,
    newRole: "admin" | "viewer"
  ) => {
    setLoadingUserId(userId);
    setError(null);

    try {
      await updateUserRole({ userId, newRole });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleRemoveUser = async (userId: Id<"users">) => {
    if (!confirm("Are you sure you want to remove this user?")) {
      return;
    }

    setLoadingUserId(userId);
    setError(null);

    try {
      await removeUser({ userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove user");
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {user.imageUrl ? (
                          <img
                            className="h-10 w-10 rounded-full"
                            src={user.imageUrl}
                            alt=""
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-gray-600 font-medium">
                              {user.name?.[0] || user.email[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name || "No name"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      {user._id !== currentUser._id && (
                        <>
                          <button
                            onClick={() =>
                              handleRoleChange(
                                user._id,
                                user.role === "admin" ? "viewer" : "admin"
                              )
                            }
                            disabled={loadingUserId === user._id}
                            className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                          >
                            {loadingUserId === user._id
                              ? "..."
                              : user.role === "admin"
                              ? "Make Viewer"
                              : "Make Admin"}
                          </button>
                          <button
                            onClick={() => handleRemoveUser(user._id)}
                            disabled={loadingUserId === user._id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {loadingUserId === user._id ? "..." : "Remove"}
                          </button>
                        </>
                      )}
                      {user._id === currentUser._id && (
                        <span className="text-gray-400 text-xs">
                          (You)
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {users.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No users found.</p>
        </div>
      )}
    </div>
  );
}
