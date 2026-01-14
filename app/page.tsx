import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const { userId } = await auth();

  if (userId) {
    // User is authenticated, redirect to dashboard
    redirect("/dashboard");
  } else {
    // User is not authenticated, redirect to sign-in
    redirect("/sign-in");
  }
}
