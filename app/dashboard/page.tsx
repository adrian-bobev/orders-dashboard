"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

export default function DashboardPage() {
  const user = useQuery(api.users.getCurrentUser);
  const { user: clerkUser, isLoaded } = useUser();

  if (user === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Setting up your account...</h3>
              <p className="text-blue-800 text-sm">
                Syncing your profile to the database. This usually takes just a moment.
              </p>
              <p className="text-blue-700 text-xs mt-2">
                {clerkUser?.primaryEmailAddress?.emailAddress || "Loading..."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          {user.role === "admin" ? "Dashboard" : "Welcome"}
        </h2>
        <p className="text-gray-600 mt-2">
          Hello, {user.name || user.email}! You are logged in as a{" "}
          <span className="font-semibold">{user.role}</span>.
        </p>
      </div>

      {user.role === "admin" ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Admin Actions
          </h3>
          <div className="space-y-4">
            <Link
              href="/dashboard/admin/users"
              className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">
                    Manage Users
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">
                    View and manage user roles and permissions
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            Welcome to the Dashboard
          </h3>
          <p className="text-blue-800">
            You have viewer access. Contact an administrator if you need
            additional permissions.
          </p>
        </div>
      )}
    </div>
  );
}
