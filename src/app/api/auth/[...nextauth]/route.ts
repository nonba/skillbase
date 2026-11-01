import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

async function authHandler(req: any, ctx: any) {
  // 古いクッキー名（next-auth.session-token）で送られた場合、新しい__Secure-クッキー名へ動的エイリアス
  if (req?.headers) {
    try {
      const cookieHeader = req.headers.get("cookie") || "";
      if (cookieHeader.includes("next-auth.session-token=") && !cookieHeader.includes("__Secure-next-auth.session-token=")) {
        const match = cookieHeader.match(/(?:^|;\s*)next-auth\.session-token=([^;]+)/);
        if (match && match[1]) {
          req.headers.set("cookie", `${cookieHeader}; __Secure-next-auth.session-token=${match[1]}`);
        }
      }
    } catch (e) {}
  }
  return NextAuth(req, ctx, authOptions);
}

export { authHandler as GET, authHandler as POST };
