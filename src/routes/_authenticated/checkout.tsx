import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { placeOrder, payForOrder } from "@/lib/orders.functions";
import { useCart } from "@/lib/cart";
import { useSession } from "@/hooks/useSession";
import { computeTotals, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Ember & Clay" },
      { name: "description", content: "Confirm your Ember & Clay order and pay." },
      { property: "og:title", content: "Checkout — Ember & Clay" },
      { property: "og:description", content: "Confirm your Ember & Clay order and pay." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { lines, subtotal, clear } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();
  const submitOrder = useServerFn(placeOrder);
  const pay = useServerFn(payForOrder);

  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [tableId, setTableId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const totals = computeTotals(subtotal);

  const { data: tables } = useQuery({
    queryKey: ["tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, table_number, seats, location")
        .eq("is_active", true)
        .order("table_number");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!customerName && user?.email) setCustomerName(user.email.split("@")[0] ?? "");
  }, [user, customerName]);

  if (lines.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-4xl text-foreground">Nothing to check out</h1>
        <Button asChild className="mt-8">
          <Link to="/menu">Browse the menu</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (orderType === "dine_in" && !tableId) {
      toast.error("Pick the table you're seated at.");
      return;
    }
    setBusy(true);
    try {
      const order = await submitOrder({
        data: {
          orderType,
          tableId: orderType === "dine_in" ? tableId : null,
          customerName: customerName.trim(),
          notes: notes.trim(),
          items: lines.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            notes: l.notes,
          })),
        },
      });
      // Simulated payment: no card is charged, the order is marked paid.
      await pay({ data: { orderId: order.id } });
      clear();
      toast.success(`Order #${order.orderNumber} sent to the kitchen`);
      navigate({ to: "/orders/$id", params: { id: order.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not place the order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit}>
        <p className="eyebrow">Step 2 of 2</p>
        <h1 className="mt-2 text-4xl text-foreground">Checkout</h1>

        <div className="warm-panel mt-8 space-y-5 rounded-lg p-6">
          <div className="space-y-2">
            <Label>Order type</Label>
            <div className="flex gap-2">
              {(["dine_in", "takeaway"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={`flex-1 rounded-md border px-4 py-3 text-sm transition-colors ${
                    orderType === t
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "dine_in" ? "Dine in" : "Takeaway"}
                </button>
              ))}
            </div>
          </div>

          {orderType === "dine_in" && (
            <div className="space-y-2">
              <Label htmlFor="table">Table</Label>
              <Select value={tableId} onValueChange={setTableId}>
                <SelectTrigger id="table">
                  <SelectValue placeholder="Which table are you at?" />
                </SelectTrigger>
                <SelectContent>
                  {(tables ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      Table {t.table_number} · {t.seats} seats · {t.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name on the ticket</Label>
            <Input
              id="name"
              required
              maxLength={80}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes for the kitchen</Label>
            <Textarea
              id="notes"
              maxLength={400}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, timing, celebrations…"
            />
          </div>
        </div>

        <div className="warm-panel mt-6 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <CreditCard className="size-5 text-primary" />
            <div>
              <h2 className="text-lg text-foreground">Simulated payment</h2>
              <p className="text-sm text-muted-foreground">
                No card is charged in this demo — the order is marked paid instantly.
              </p>
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>
          {busy ? "Sending to the kitchen…" : `Pay ${formatMoney(totals.total)} and place order`}
        </Button>
      </form>

      <aside className="warm-panel h-fit rounded-lg p-6 lg:sticky lg:top-24">
        <h2 className="text-xl text-foreground">Your dishes</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {lines.map((l) => (
            <li key={l.menuItemId} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {l.quantity} × {l.name}
              </span>
              <span className="text-foreground">{formatMoney(l.price * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatMoney(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax + service</dt>
            <dd>{formatMoney(totals.tax + totals.serviceCharge)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3">
            <dt className="text-foreground">Total</dt>
            <dd className="text-lg text-accent">{formatMoney(totals.total)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
