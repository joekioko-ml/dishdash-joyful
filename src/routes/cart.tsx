import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { computeTotals, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your order — Ember & Clay" },
      { name: "description", content: "Review the dishes in your Ember & Clay order before checkout." },
      { property: "og:title", content: "Your order — Ember & Clay" },
      { property: "og:description", content: "Review your Ember & Clay order before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, subtotal, setQuantity, setNotes, remove } = useCart();
  const totals = computeTotals(subtotal);

  if (lines.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-4xl text-foreground">Your order is empty</h1>
        <p className="mt-3 text-muted-foreground">Pick a few dishes and they'll show up here.</p>
        <Button asChild className="mt-8">
          <Link to="/menu">Browse the menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_360px]">
      <div>
        <p className="eyebrow">Order review</p>
        <h1 className="mt-2 text-4xl text-foreground">Your order</h1>

        <ul className="mt-8 space-y-4">
          {lines.map((line) => (
            <li key={line.menuItemId} className="warm-panel flex gap-4 rounded-lg p-4">
              <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                {line.imageUrl && (
                  <img
                    src={line.imageUrl}
                    alt={line.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg text-foreground">{line.name}</h2>
                  <span className="text-sm text-accent">
                    {formatMoney(line.price * line.quantity)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{formatMoney(line.price)} each</p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center rounded-md border border-border">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="min-w-8 text-center text-sm">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      className="px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setQuantity(line.menuItemId, Math.min(30, line.quantity + 1))}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <Input
                    value={line.notes}
                    maxLength={160}
                    placeholder="Kitchen note (allergies, doneness…)"
                    onChange={(e) => setNotes(line.menuItemId, e.target.value)}
                    className="h-9 flex-1 min-w-48"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => remove(line.menuItemId)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="warm-panel h-fit rounded-lg p-6 lg:sticky lg:top-24">
        <h2 className="text-xl text-foreground">Summary</h2>
        <dl className="mt-5 space-y-2.5 text-sm">
          <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
          <Row label="Tax (5%)" value={formatMoney(totals.tax)} />
          <Row label="Service (8%)" value={formatMoney(totals.serviceCharge)} />
          <div className="border-t border-border pt-3">
            <Row label="Estimated total" value={formatMoney(totals.total)} strong />
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Final pricing is recalculated from the live menu when you place the order.
        </p>
        <Button asChild className="mt-6 w-full" size="lg">
          <Link to="/checkout">Continue to checkout</Link>
        </Button>
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link to="/menu">Add more dishes</Link>
        </Button>
      </aside>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "text-lg text-accent" : "text-foreground"}>{value}</dd>
    </div>
  );
}
