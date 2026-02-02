import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user;
}

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user.id;
}

export async function getOptionalUser() {
  const session = await auth();
  return session?.user || null;
}
