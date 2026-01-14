import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserManagementTable } from "@/components/admin/user-management-table";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export default async function AdminUsersPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Preload the users data for the client component
  const preloadedUsers = await preloadQuery(api.users.getCurrentUser);

  // Check if user is admin (we'll do this on the client side as well)
  // This is just a basic check - the real authorization happens in Convex

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Управление на потребители</h2>
        <p className="text-gray-600 mt-2">
          Управление на потребителски роли и разрешения в платформата.
        </p>
      </div>

      <UserManagementTable />
    </div>
  );
}
