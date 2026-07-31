import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { OrderStatusBadge, ORDER_STATUS_FLOW } from "@/components/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order ticket — Ember & Clay" },
      { name: "description", content: "Follow your Ember & Clay ticket from the pass to the table." },
      { property: "og:title", content: "Order ticket — Ember & Clay" },
      { property: "og:description", content: "Follow your Ember & Clay ticket in real time." },
    ],
  }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, payment_status, order_type, customer_name, notes, subtotal, tax, service_charge, discount, total, placed_at, restaurant_tables(table_number, location), order_items(id, item_name, quantity, unit_price, notes)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["order", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-4xl text-foreground">Ticket not found</h1>
        <Button asChild className="mt-8">
          <Link to="/orders">Back to my orders</Link>
        </Button>
      </div>
    );
  }

  const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link to="/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← My orders
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="text-5xl text-foreground">#{order.order_number}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatDateTime(order.placed_at)} ·{" "}
        {order.order_type === "dine_in"
          ? `Table ${order.restaurant_tables?.table_number ?? "—"} (${order.restaurant_tables?.location ?? ""})`
          : "Takeaway"}{" "}
        · {order.payment_status === "paid" ? "Paid" : "Unpaid"}
      </p>

      {order.status !== "cancelled" && (
        <ol className="warm-panel mt-8 grid grid-cols-4 gap-2 rounded-lg p-5">
          {ORDER_STATUS_FLOW.map((step, i) => (
            <li key={step} className="text-center">
              <div
                className={`mx-auto flex size-8 items-center justify-center rounded-full border ${
                  i <= currentIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {i <= currentIndex ? <CheckCircle2 className="size-4" /> : i + 1}
              </div>
              <p
                className={`mt-2 text-xs capitalize ${
                  i <= currentIndex ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="warm-panel mt-6 rounded-lg p-6">
        <h2 className="text-xl text-foreground">Items</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4">
              <div>
                <p className="text-foreground">
                  {item.quantity} × {item.item_name}
                </p>
                {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
              </div>
              <span className="text-foreground">
                {formatMoney(Number(item.unit_price) * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        {order.notes && (
          <p className="mt-5 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Note to kitchen: {order.notes}
          </p>
        )}

        <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
          <Row label="Subtotal" value={formatMoney(Number(order.subtotal))} />
          <Row label="Tax" value={formatMoney(Number(order.tax))} />
          <Row label="Service charge" value={formatMoney(Number(order.service_charge))} />
          {Number(order.discount) > 0 && (
            <Row label="Discount" value={`− ${formatMoney(Number(order.discount))}`} />
          )}
          <div className="flex justify-between border-t border-border pt-3">
            <dt className="text-foreground">Total</dt>
            <dd className="text-lg text-accent">{formatMoney(Number(order.total))}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
