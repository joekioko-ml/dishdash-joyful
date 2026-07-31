import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-display text-base text-foreground">Ember &amp; Clay</span> · 14 Kiln
          Street · Open 12:00–23:30
        </p>
        <div className="flex gap-5">
          <Link to="/menu" className="hover:text-foreground">
            Menu
          </Link>
          <Link to="/reserve" className="hover:text-foreground">
            Reserve
          </Link>
          <Link to="/orders" className="hover:text-foreground">
            Orders
          </Link>
        </div>
      </div>
    </footer>
  );
}
