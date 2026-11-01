import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { ChunkErrorListener } from "@/components/ChunkErrorListener";

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://skillbase.easystance.app"),
  title: "SKILLBASE | 野球指導・育成・知識共有プラットフォーム",
  description: "チームの技術・知識・指導動画を蓄えてスキルアップする、野球チーム向け教育・コミュニケーションプラットフォーム。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SKILLBASE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <SessionProvider>
          <ChunkErrorListener />
          {children}
          <PwaInstallPrompt />
        </SessionProvider>
      </body>
    </html>
  );
}
