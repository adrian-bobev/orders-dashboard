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

  // Check if current user or users list is loading
  if (currentUser === undefined || users === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-purple-200 animate-spin-slow"></div>
          <div className="absolute inset-0 rounded-full border-t-4 border-purple-600 animate-spin"></div>
        </div>
      </div>
    );
  }

  // Check if user is not authenticated or not found
  if (!currentUser) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-warm border-2 border-red-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center shadow-warm flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-red-900 font-bold text-sm md:text-base">
            Грешка при зареждане на потребителски данни.
          </p>
        </div>
      </div>
    );
  }

  if (currentUser.role !== "admin") {
    router.push("/dashboard");
    return (
      <div className="bg-white rounded-2xl p-6 shadow-warm border-2 border-amber-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-warm flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-amber-900 font-bold text-sm md:text-base">
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
    <div className="space-y-4">
      {error && (
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-warm border-2 border-red-200 animate-shake">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center shadow-warm flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-900 font-bold text-sm md:text-base">{error}</p>
          </div>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-2xl shadow-warm border border-purple-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-purple-50 border-b-2 border-purple-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Потребител
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Имейл
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Роля
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-purple-900 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-purple-900 uppercase tracking-wider">
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
                      : "bg-neutral-50 hover:bg-neutral-100"
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {user.imageUrl ? (
                          <img
                            className={`w-10 h-10 rounded-xl border-2 shadow-sm ${
                              user.isActive
                                ? "border-purple-200"
                                : "border-neutral-300 grayscale"
                            }`}
                            src={user.imageUrl}
                            alt=""
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                            user.isActive
                              ? "bg-purple-600"
                              : "bg-neutral-400"
                          }`}>
                            <span className="text-white font-bold text-sm">
                              {user.name?.[0] || user.email[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className={`text-sm font-bold truncate ${
                          user.isActive ? "text-purple-900" : "text-neutral-500"
                        }`}>
                          {user.name || "Без име"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`text-sm font-medium truncate max-w-[200px] ${
                      user.isActive ? "text-neutral-700" : "text-neutral-500"
                    }`}>{user.email}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-xl shadow-sm ${
                        user.role === "admin"
                          ? user.isActive
                            ? "bg-purple-600 text-white"
                            : "bg-neutral-400 text-white"
                          : user.isActive
                            ? "bg-green-500 text-white"
                            : "bg-neutral-400 text-white"
                      }`}
                    >
                      {user.role === "admin" ? "админ" : "наблюд."}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-xl shadow-sm ${
                        user.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.isActive ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
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
                            className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 disabled:opacity-50 font-bold text-xs transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5"
                          >
                            {loadingUserId === user._id
                              ? "..."
                              : user.role === "admin"
                              ? "→ Наблюд."
                              : "→ Админ"}
                          </button>
                          <button
                            onClick={() => handleRemoveUser(user._id)}
                            disabled={loadingUserId === user._id}
                            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 disabled:opacity-50 font-bold text-xs transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5"
                          >
                            {loadingUserId === user._id ? "..." : "Премахни"}
                          </button>
                        </>
                      )}
                      {user._id !== currentUser._id && !user.isActive && (
                        <button
                          onClick={() => handleReactivateUser(user._id)}
                          disabled={loadingUserId === user._id}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 disabled:opacity-50 font-bold text-xs transition-all duration-300 hover:shadow-sm hover:-translate-y-0.5"
                        >
                          {loadingUserId === user._id ? "..." : "Активирай"}
                        </button>
                      )}
                      {user._id === currentUser._id && (
                        <span className="px-3 py-1 bg-neutral-100 text-neutral-600 text-xs font-bold rounded-xl">
                          Вие
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

      {/* Mobile/Tablet Card View */}
      <div className="lg:hidden space-y-3">
        {users.map((user, index) => (
          <div
            key={user._id}
            className={`bg-white rounded-2xl shadow-warm border overflow-hidden transition-all duration-300 ${
              user.isActive
                ? "border-purple-100"
                : "border-neutral-200"
            }`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="p-4">
              {/* User Info Section */}
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0">
                  {user.imageUrl ? (
                    <img
                      className={`w-12 h-12 rounded-xl border-2 shadow-sm ${
                        user.isActive
                          ? "border-purple-200"
                          : "border-neutral-300 grayscale"
                      }`}
                      src={user.imageUrl}
                      alt=""
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                      user.isActive
                        ? "bg-purple-600"
                        : "bg-neutral-400"
                    }`}>
                      <span className="text-white font-bold text-base">
                        {user.name?.[0] || user.email[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className={`font-bold text-base truncate ${
                      user.isActive ? "text-purple-900" : "text-neutral-500"
                    }`}>
                      {user.name || "Без име"}
                    </h3>
                    {user._id === currentUser._id && (
                      <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-bold rounded-lg flex-shrink-0">
                        Вие
                      </span>
                    )}
                  </div>
                  <p className={`text-sm truncate mb-2 ${
                    user.isActive ? "text-neutral-700" : "text-neutral-500"
                  }`}>
                    {user.email}
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-lg shadow-sm ${
                        user.role === "admin"
                          ? user.isActive
                            ? "bg-purple-600 text-white"
                            : "bg-neutral-400 text-white"
                          : user.isActive
                            ? "bg-green-500 text-white"
                            : "bg-neutral-400 text-white"
                      }`}
                    >
                      {user.role === "admin" ? "Админ" : "Наблюд."}
                    </span>
                    <span
                      className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-lg shadow-sm ${
                        user.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.isActive ? "Активен" : "Неактивен"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {user._id !== currentUser._id && (
                <div className="flex gap-2 pt-3 border-t border-neutral-100">
                  {user.isActive ? (
                    <>
                      <button
                        onClick={() =>
                          handleRoleChange(
                            user._id,
                            user.role === "admin" ? "viewer" : "admin"
                          )
                        }
                        disabled={loadingUserId === user._id}
                        className="flex-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 disabled:opacity-50 font-bold text-sm transition-all duration-300"
                      >
                        {loadingUserId === user._id
                          ? "..."
                          : user.role === "admin"
                          ? "→ Наблюд."
                          : "→ Админ"}
                      </button>
                      <button
                        onClick={() => handleRemoveUser(user._id)}
                        disabled={loadingUserId === user._id}
                        className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 disabled:opacity-50 font-bold text-sm transition-all duration-300"
                      >
                        {loadingUserId === user._id ? "..." : "Премахни"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleReactivateUser(user._id)}
                      disabled={loadingUserId === user._id}
                      className="w-full px-3 py-2 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 disabled:opacity-50 font-bold text-sm transition-all duration-300"
                    >
                      {loadingUserId === user._id ? "..." : "Активирай отново"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="bg-white rounded-2xl shadow-warm border border-purple-100 p-12 text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-neutral-500 font-bold text-base">Не са намерени потребители.</p>
        </div>
      )}
    </div>
  );
}
