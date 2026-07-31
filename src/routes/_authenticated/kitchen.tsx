import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/RoleGate";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export const Route = createFileRoute("/_authenticated/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen board — Ember & Clay" },
      { name: "description", content: "Live kitchen queue for the Ember & Clay pass." },
      { property: "og:title", content: "Kitchen board — Ember & Clay" },
      { property: "og:description", content: "Live kitchen queue for the Ember & Clay pass." },
    ],
  }),
  component: () => (
    <RoleGate allow={["chef", "admin"]}>
      <KitchenBoard />
    </RoleGate>
  ),
});

const COLUMNS: { status: OrderStatus; title: string; next?: OrderStatus; cta?: string }[] = [
  { status: "placed", title: "New tickets", next: "preparing", cta: "Start cooking" },
  { status: "preparing", title: "On the pans", next: "ready", cta: "Mark ready" },
  { status: "ready", title: "Ready to run", next: "served", cta: "Handed over" },
];

function KitchenBoard() {
  const queryClient = useQueryClient();

  const { data: orders } = useQuery({
    queryKey: ["kitchen-orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, order_type, notes, placed_at, customer_name, restaurant_tables(table_number), order_items(id, item_name, quantity, notes)",
        )
        .in("status", ["placed", "preparing", "ready"])
        .order("placed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () =>
        queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function advance(id: string, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Expo · live</p>
      <h1 className="mt-2 text-4xl text-foreground">Kitchen board</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const tickets = (orders ?? []).filter((o) => o.status === col.status);
          return (
            <section key={col.status} className="rounded-lg border border-border bg-sidebar p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl text-foreground">{col.title}</h2>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {tickets.length}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {tickets.map((ticket) => (
                  <article key={ticket.id} className="warm-panel rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-2xl text-foreground">
                        #{ticket.order_number}
                      </span>
                      <OrderStatusBadge status={ticket.status} />
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatTime(ticket.placed_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                      {ticket.order_type === "dine_in"
                        ? `Table ${ticket.restaurant_tables?.table_number ?? "—"}`
                        : "Takeaway"}{" "}
                      · {ticket.customer_name}
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {ticket.order_items.map((item) => (
                        <li key={item.id}>
                          <span className="text-foreground">
                            {item.quantity} × {item.item_name}
                          </span>
                          {item.notes && (
                            <span className="block text-xs text-accent">↳ {item.notes}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {ticket.notes && (
                      <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                        {ticket.notes}
                      </p>
                    )}
                    <div className="mt-4 flex gap-2">
                      {col.next && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => advance(ticket.id, col.next!)}
                        >
                          {col.cta}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => advance(ticket.id, "cancelled")}
                      >
                        Void
                      </Button>
                    </div>
                  </article>
                ))}
                {tickets.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
