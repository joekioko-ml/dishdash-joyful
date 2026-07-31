import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { formatDateTime, formatMoney } from "@/lib/format";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "My orders — Ember & Clay" },
      { name: "description", content: "Track your Ember & Clay orders from the pass to the table." },
      { property: "og:title", content: "My orders — Ember & Clay" },
      { property: "og:description", content: "Track your Ember & Clay orders in real time." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, payment_status, order_type, total, placed_at, order_items(id, quantity, item_name)")
        .order("placed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("my-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Live ticket status</p>
      <h1 className="mt-2 text-4xl text-foreground">My orders</h1>

      {isLoading && (
        <div className="mt-8 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && (orders ?? []).length === 0 && (
        <div className="warm-panel mt-8 rounded-lg p-10 text-center">
          <p className="text-muted-foreground">You haven't placed an order yet.</p>
          <Button asChild className="mt-6">
            <Link to="/menu">Browse the menu</Link>
          </Button>
        </div>
      )}

      <ul className="mt-8 space-y-4">
        {(orders ?? []).map((order) => (
          <li key={order.id}>
            <Link
              to="/orders/$id"
              params={{ id: order.id }}
              className="warm-panel block rounded-lg p-5 transition-colors hover:border-primary/50"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-2xl text-foreground">#{order.order_number}</span>
                <OrderStatusBadge status={order.status} />
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {order.order_type === "dine_in" ? "Dine in" : "Takeaway"}
                </span>
                <span className="ml-auto text-accent">{formatMoney(Number(order.total))}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {order.order_items.map((i) => `${i.quantity}× ${i.item_name}`).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTime(order.placed_at)} · {order.payment_status}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
