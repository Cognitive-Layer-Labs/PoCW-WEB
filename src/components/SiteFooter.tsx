import { BookmapMark } from "@/components/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 text-sm text-mute sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="flex items-center gap-2">
          <BookmapMark className="h-5 w-5" />
          <span>
            <span className="font-serif font-semibold text-paper">Bookmap</span>, powered by the PoCW engine.
          </span>
        </p>
        <p>Your shelf is private. A shared result shows only your first name, the book and your score.</p>
      </div>
    </footer>
  );
}
