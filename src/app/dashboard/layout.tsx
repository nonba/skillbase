import BottomNav from "@/components/BottomNav";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ForcePasswordChangeModal } from "@/components/ForcePasswordChangeModal";
import GlobalCallListener from "@/components/GlobalCallListener";
import { PushNotificationManager } from "@/components/PushNotificationManager";
import AppUpdateNotifier from "@/components/AppUpdateNotifier";
import ClientOnly from "@/components/ClientOnly";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: any = null;
  try {
    session = await getServerSession(authOptions);
  } catch (e) {
    console.error("[DashboardLayout] getServerSession catch:", e);
  }

  // OB(卒団者)は専用の限定画面(/ob)へ
  if (session?.user?.graduated === true) {
    redirect("/ob");
  }

  const requiresPasswordChange = session?.user?.requiresPasswordChange === true;

  return (
    <div className="dashboard-layout">
      <ForcePasswordChangeModal isOpen={requiresPasswordChange} />
      <ClientOnly>
        <AppUpdateNotifier />
        <GlobalCallListener />
        <PushNotificationManager headless />
        <BottomNav />
      </ClientOnly>

      <div className="dashboard-content">{children}</div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .dashboard-layout {
          display: flex;
          min-height: 100vh;
        }

        .dashboard-content {
          flex: 1;
          width: 100%;
        }

        @media (max-width: 768px) {
          .dashboard-content {
            padding-bottom: calc(60px + env(safe-area-inset-bottom, 16px));
          }
        }

        @media (min-width: 769px) {
          .dashboard-content {
            padding-left: 240px;
          }
        }
      `,
        }}
      />
    </div>
  );
}
