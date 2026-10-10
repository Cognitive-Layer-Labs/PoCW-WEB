import Link from "next/link";
import { Plus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { buttonVariants } from "@/components/ui/button";
import { isAdmin, type User } from "@/lib/server/auth";
import { cn } from "@/lib/utils";

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-8">
        <Link href="/shelf" aria-label="Bookmap, your shelf" className="mr-auto flex min-h-11 items-center rounded-lg">
          <Logo compact />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
          <Link href="/shelf" className="flex min-h-11 items-center rounded-full px-3 font-semibold text-mute hover:text-paper">
            <span className="sm:hidden">Shelf</span>
            <span className="hidden sm:inline">Your shelf</span>
          </Link>
          <Link href="/add" className={cn(buttonVariants({ size: "default" }), "px-4")}>
            <Plus aria-hidden="true" />
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add a book</span>
          </Link>
        </nav>
        <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} admin={isAdmin(user)} />
      </div>
    </header>
  );
}
