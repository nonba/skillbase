import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      teamId: string | null;
      isOwner?: boolean;
      canManageSchedule?: boolean;
      canManageUsers?: boolean;
      canManagePosts?: boolean;
      canManageScore?: boolean;
      requiresPasswordChange?: boolean;
    } & DefaultSession["user"]
  }

  interface User {
    id: string;
    role: string;
    teamId: string | null;
    isOwner?: boolean;
    canManageSchedule?: boolean;
    canManageUsers?: boolean;
    canManagePosts?: boolean;
      canManageScore?: boolean;
    requiresPasswordChange?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    teamId: string | null;
    isOwner?: boolean;
    canManageSchedule?: boolean;
    canManageUsers?: boolean;
    canManagePosts?: boolean;
      canManageScore?: boolean;
    requiresPasswordChange?: boolean;
  }
}
