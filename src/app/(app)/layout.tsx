import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { currentUser } from "@/lib/server/auth";

/**
 * Signed-in shell. Every page under it calls requireUser() itself (layouts
 * don't re-run on client navigation, and the page knows where to send the
 * reader back to after sign-in).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return <main id="main">{children}</main>;
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader user={user} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
