import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { getEnv } from "./env";
import { EMAIL_NOT_VERIFIED_ERROR } from "./authMessages";
import { verifyTicket } from "./baseTicket";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Login ID", type: "text" },
        password: { label: "Password", type: "password" },
        deviceId: { label: "Device ID", type: "text" },
        userAgent: { label: "User Agent", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("ログインIDとパスワードを入力してください。");
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        // ID・パスワードのどちらが間違いかを区別しない（アカウントの存在を推測させない）。
        // ユーザーが存在しない場合もダミーのハッシュと照合し、応答時間の差で見分けられないようにする。
        const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4v2qG1h0aE3o6dX5l1bZ7Yq0XqGe";
        const isValidPassword = await bcrypt.compare(
          credentials.password,
          user?.password || DUMMY_HASH
        );

        if (!user || !user.password || !isValidPassword) {
          throw new Error("ログインIDまたはパスワードが正しくありません。");
        }

        // ロステージ経由で作られた選手/保護者はemailVerificationTokenを発行しないため対象外。
        // オーナー自己登録のみ、確認メールのリンクを踏むまでログインをブロックする。
        if (user.emailVerificationToken) {
          throw new Error(EMAIL_NOT_VERIFIED_ERROR);
        }

        // デバイスチェック
        if (credentials.deviceId) {
          const MAX_DEVICES = 3;
          const userDevices = await db.userDevice.findMany({
            where: { userId: user.id },
            orderBy: { lastActive: "asc" }
          });
          
          const existingDevice = userDevices.find(d => d.deviceId === credentials.deviceId);
          
          if (!existingDevice) {
            // 同じUserAgent（同じ機種）のデバイスがあれば、アンインストール後の再登録と判断して上書き
            const sameAgentDevice = userDevices.find(d => 
              d.userAgent === (credentials.userAgent || "Unknown Device")
            );

            if (sameAgentDevice) {
              // 同機種の古いエントリを新しいIDで更新
              await db.userDevice.update({
                where: { id: sameAgentDevice.id },
                data: {
                  deviceId: credentials.deviceId,
                  lastActive: new Date()
                }
              });
            } else if (userDevices.length >= MAX_DEVICES) {
              // 上限超えの場合は最も古いデバイスを自動削除して新規登録
              const oldest = userDevices[0];
              await db.userDevice.delete({ where: { id: oldest.id } });
              await db.userDevice.create({
                data: {
                  userId: user.id,
                  deviceId: credentials.deviceId,
                  userAgent: credentials.userAgent || "Unknown Device",
                }
              });
            } else {
              // 新規デバイス登録
              await db.userDevice.create({
                data: {
                  userId: user.id,
                  deviceId: credentials.deviceId,
                  userAgent: credentials.userAgent || "Unknown Device",
                }
              });
            }
          } else {
            // 既存デバイスの最終アクティブ日時を更新
            await db.userDevice.update({
              where: { id: existingDevice.id },
              data: { lastActive: new Date() }
            });
          }
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          teamId: user.teamId,
          isOwner: user.isOwner,
          canManageSchedule: user.canManageSchedule,
          canManageUsers: user.canManageUsers,
          canManagePosts: user.canManagePosts,
          canManageScore: user.canManageScore,
          requiresPasswordChange: user.requiresPasswordChange,
          graduated: user.graduated,
        };
      }
    }),
    // 「BASE アカウントでログイン」(試作・2026-11-11): 土台(HOMEBASE)が発行した、短い期限の署名つき通行証で、ログインする。
    // 通行証の署名・宛先(skillbase)・期限と、ログインを始めたときの合言葉(state。この端末のクッキーと同じか)を確かめる。
    // すでに SKILLBASE のユーザーが、本人の操作で結んである(baseUserId)人だけが入れる。自動では結ばない。
    CredentialsProvider({
      id: "base-ticket",
      name: "BASE Account",
      credentials: { ticket: { label: "Ticket", type: "text" }, state: { label: "State", type: "text" } },
      async authorize(credentials, req) {
        const secret = getEnv("ID_TICKET_SECRET");
        if (!credentials?.ticket || !credentials?.state || secret.length < 32) {
          throw new Error("BASE_LOGIN_FAILED");
        }
        const cookie = String((req as any)?.headers?.cookie ?? (req as any)?.headers?.get?.("cookie") ?? "");
        const m = /(?:^|;\s*)base_state=([A-Za-z0-9_-]{16,128})/.exec(cookie);
        const claims = await verifyTicket(credentials.ticket, secret, "skillbase");
        // 断った理由の種類を、記号で返す(通行証・合言葉の中身は返さない)
        if (!claims) throw new Error("BASE_LOGIN_FAILED_TICKET");
        if (!m) throw new Error("BASE_LOGIN_FAILED_NOCOOKIE");
        if (m[1] !== credentials.state || claims.state !== credentials.state) throw new Error("BASE_LOGIN_FAILED_STATE");
        if (!credentials.state.startsWith("s-")) throw new Error("BASE_LOGIN_FAILED_MODE");
        const user = await db.user.findUnique({ where: { baseUserId: claims.sub } });
        if (!user) throw new Error("BASE_NOT_LINKED");
        if (user.emailVerificationToken) throw new Error(EMAIL_NOT_VERIFIED_ERROR);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          teamId: user.teamId,
          isOwner: user.isOwner,
          canManageSchedule: user.canManageSchedule,
          canManageUsers: user.canManageUsers,
          canManagePosts: user.canManagePosts,
          canManageScore: user.canManageScore,
          requiresPasswordChange: user.requiresPasswordChange,
          graduated: user.graduated,
        };
      },
    }),
  ],
  callbacks: {
    // ログイン後のリダイレクト先を確実に本番URLに向ける。
    // NextAuthは起動時に一度だけベースURLを決めるが、OpenNext(Workers)では
    // その時点でNEXTAUTH_URLが未注入のため localhost:3000 にフォールバックしてしまう。
    // このコールバックはリクエスト毎に実行されるので、ここで正しいURLを解決する。
    async redirect({ url, baseUrl }) {
      const defaultBase =
        process.env.NODE_ENV === "production"
          ? "https://skillbase.easystance.app"
          : baseUrl || "http://localhost:3000";
      const prodBase = (getEnv("NEXTAUTH_URL") || process.env.NEXTAUTH_URL || defaultBase).replace(/\/$/, "");
      // 相対パス（例 /dashboard）はベースURLに接続
      if (url.startsWith("/")) return `${prodBase}${url}`;
      // 絶対URLは同一オリジンのみ許可、それ以外はトップへ
      try {
        if (new URL(url).origin === prodBase) return url;
      } catch {}
      return prodBase;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.teamId = (user as any).teamId;
        token.isOwner = (user as any).isOwner;
        token.canManageSchedule = (user as any).canManageSchedule;
        token.canManageUsers = (user as any).canManageUsers;
        token.canManagePosts = (user as any).canManagePosts;
        token.canManageScore = (user as any).canManageScore;
        token.requiresPasswordChange = (user as any).requiresPasswordChange;
        token.graduated = (user as any).graduated;
      }
      // クライアントから渡された値は信用しない（update()で teamId や権限を書き換えられるのを防ぐ）。
      // 更新要求があった場合は、必ずDBの最新値でトークンを作り直す。
      if (trigger === "update" && token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id as string },
          select: {
            name: true,
            role: true,
            teamId: true,
            isOwner: true,
            canManageSchedule: true,
            canManageUsers: true,
            canManagePosts: true,
            canManageScore: true,
            requiresPasswordChange: true,
            graduated: true,
          },
        });
        if (fresh) {
          token.name = fresh.name;
          token.role = fresh.role;
          token.teamId = fresh.teamId;
          token.isOwner = fresh.isOwner;
          token.canManageSchedule = fresh.canManageSchedule;
          token.canManageUsers = fresh.canManageUsers;
          token.canManagePosts = fresh.canManagePosts;
          token.canManageScore = fresh.canManageScore;
          token.requiresPasswordChange = fresh.requiresPasswordChange;
          token.graduated = fresh.graduated;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).teamId = token.teamId;
        (session.user as any).isOwner = token.isOwner;
        (session.user as any).canManageSchedule = token.canManageSchedule;
        (session.user as any).canManageUsers = token.canManageUsers;
        (session.user as any).canManagePosts = token.canManagePosts;
        (session.user as any).canManageScore = token.canManageScore;
        (session.user as any).requiresPasswordChange = token.requiresPasswordChange;
        (session.user as any).graduated = token.graduated;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production" ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  get secret() {
    return getEnv("NEXTAUTH_SECRET") || process.env.NEXTAUTH_SECRET || "fallback-secret-for-dev";
  },
};
