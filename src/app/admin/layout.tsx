import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/server/admin-gate";

export const dynamic = "force-dynamic";

/** Every /admin page is for ADMIN_EMAILS only; everyone else gets the ordinary 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <AdminShell user={user}>{children}</AdminShell>;
}
