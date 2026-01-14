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
    api.users.listAllUsers,
    currentUser !== undefined && currentUser !== null ? {} : "skip"
  );

  const updateUserRole = useMutation(api.users.updateUserRole);
  const removeUser = useMutation(api.users.removeUser);
  const reactivateUser = useMutation(api.users.reactivateUser);

  const [loadingUserId, setLoadingUserId] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if current user is loading
  if (currentUser === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[500px]">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-purple-200 animate-spin-slow"></div>
          <div className="absolute inset-0 rounded-full border-t-4 border-purple-600 animate-spin"></div>
        </div>
      </div>
    );
  }

  // Check if user is not found in database
  if (!currentUser) {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-warm border-2 border-red-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-red-500 rounded-2xl flex items-center justify-center shadow-warm">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-red-900 font-bold text-lg">
            Грешка при зареждане на потребителски данни.
          </p>
        </div>
      </div>
    );
  }

  // Check if users list is loading
  if (users === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[500px]">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-purple-200 animate-spin-slow"></div>
          <div className="absolute inset-0 rounded-full border-t-4 border-purple-600 animate-spin"></div>
        </div>
      </div>
    );
  }

  if (currentUser.role !== "admin") {
    router.push("/dashboard");
    return (
      <div className="bg-white rounded-3xl p-8 shadow-warm border-2 border-amber-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center shadow-warm">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-amber-900 font-bold text-lg">
            Нямате разрешение за достъп до тази страница. Пренасочване...
          </p>
        </div>
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
      setError(err instanceof Error ? err.message : "Неуспешна промяна на роля");
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleRemoveUser = async (userId: Id<"users">) => {
    if (!confirm("Сигурни ли сте, че искате да премахнете този потребител?")) {
      return;
    }

    setLoadingUserId(userId);
    setError(null);

    try {
      await removeUser({ userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешно премахване на потребител");
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleReactivateUser = async (userId: Id<"users">) => {
    if (!confirm("Сигурни ли сте, че искате да активирате отново този потребител?")) {
      return;
    }

    setLoadingUserId(userId);
    setError(null);

    try {
      await reactivateUser({ userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неуспешна активация на потребител");
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-white rounded-3xl p-8 shadow-warm border-2 border-red-200 animate-shake">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center shadow-warm">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-900 font-bold text-lg">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-warm border border-purple-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-purple-50 border-b-2 border-purple-100">
                <th className="px-8 py-5 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Потребител
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Имейл
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Роля
                </th>
                <th className="px-8 py-5 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-8 py-5 text-right text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {users.map((user, index) => (
                <tr
                  key={user._id}
                  className={`transition-colors duration-200 ${
                    user.isActive
                      ? "hover:bg-purple-50/50"
                      : "bg-neutral-50 hover:bg-neutral-100 opacity-60"
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="px-8 py-6 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 w-14 h-14">
                        {user.imageUrl ? (
                          <img
                            className={`w-14 h-14 rounded-2xl border-2 shadow-warm ${
                              user.isActive
                                ? "border-purple-200"
                                : "border-neutral-300 grayscale"
                            }`}
                            src={user.imageUrl}
                            alt=""
                          />
                        ) : (
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-warm ${
                            user.isActive
                              ? "bg-purple-600"
                              : "bg-neutral-400"
                          }`}>
                            <span className="text-white font-bold text-xl">
                              {user.name?.[0] || user.email[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-5">
                        <div className={`text-base font-bold ${
                          user.isActive ? "text-purple-900" : "text-neutral-500"
                        }`}>
                          {user.name || "Без име"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap">
                    <div className={`text-base font-medium ${
                      user.isActive ? "text-neutral-700" : "text-neutral-500"
                    }`}>{user.email}</div>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap">
                    <span
                      className={`px-4 py-2 inline-flex text-xs leading-5 font-bold rounded-2xl shadow-warm ${
                        user.role === "admin"
                          ? user.isActive
                            ? "bg-purple-600 text-white"
                            : "bg-neutral-400 text-white"
                          : user.isActive
                            ? "bg-green-500 text-white"
                            : "bg-neutral-400 text-white"
                      }`}
                    >
                      {user.role === "admin" ? "администратор" : user.role === "viewer" ? "наблюдател" : user.role}
                    </span>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap">
                    <span
                      className={`px-4 py-2 inline-flex text-xs leading-5 font-bold rounded-2xl shadow-warm ${
                        user.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.isActive ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-3">
                      {user._id !== currentUser._id && user.isActive && (
                        <>
                          <button
                            onClick={() =>
                              handleRoleChange(
                                user._id,
                                user.role === "admin" ? "viewer" : "admin"
                              )
                            }
                            disabled={loadingUserId === user._id}
                            className="px-5 py-2.5 bg-purple-100 text-purple-700 rounded-2xl hover:bg-purple-200 disabled:opacity-50 font-bold transition-all duration-300 hover:shadow-warm hover:-translate-y-0.5"
                          >
                            {loadingUserId === user._id
                              ? "..."
                              : user.role === "admin"
                              ? "Направи наблюдател"
                              : "Направи администратор"}
                          </button>
                          <button
                            onClick={() => handleRemoveUser(user._id)}
                            disabled={loadingUserId === user._id}
                            className="px-5 py-2.5 bg-red-100 text-red-700 rounded-2xl hover:bg-red-200 disabled:opacity-50 font-bold transition-all duration-300 hover:shadow-warm hover:-translate-y-0.5"
                          >
                            {loadingUserId === user._id ? "..." : "Премахни"}
                          </button>
                        </>
                      )}
                      {user._id !== currentUser._id && !user.isActive && (
                        <button
                          onClick={() => handleReactivateUser(user._id)}
                          disabled={loadingUserId === user._id}
                          className="px-5 py-2.5 bg-green-100 text-green-700 rounded-2xl hover:bg-green-200 disabled:opacity-50 font-bold transition-all duration-300 hover:shadow-warm hover:-translate-y-0.5"
                        >
                          {loadingUserId === user._id ? "..." : "Активирай отново"}
                        </button>
                      )}
                      {user._id === currentUser._id && (
                        <span className="px-4 py-2 bg-neutral-100 text-neutral-600 text-xs font-bold rounded-2xl">
                          (Вие)
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
        <div className="bg-white rounded-3xl shadow-warm border border-purple-100 p-16 text-center">
          <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-neutral-500 font-bold text-xl">Не са намерени потребители.</p>
        </div>
      )}
    </div>
  );
}
