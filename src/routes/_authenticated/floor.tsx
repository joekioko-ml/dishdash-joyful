import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/RoleGate";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { formatMoney, formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/floor")({
  head: () => ({
    meta: [
      { title: "Floor view — Ember & Clay" },
      { name: "description", content: "Table status, open tickets and today's bookings." },
      { property: "og:title", content: "Floor view — Ember & Clay" },
      { property: "og:description", content: "Table status and open tickets at Ember & Clay." },
    ],
  }),
  component: () => (
    <RoleGate allow={["waiter", "admin"]}>
      <FloorView />
    </RoleGate>
  ),
});

function FloorView() {
  const queryClient = useQueryClient();

  const { data: tables } = useQuery({
    queryKey: ["floor-tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, table_number, seats, location, is_active")
        .order("table_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: openOrders } = useQuery({
    queryKey: ["floor-orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, payment_status, total, table_id, order_type, placed_at, customer_name")
        .in("status", ["placed", "preparing", "ready", "served"])
        .order("placed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: bookings } = useQuery({
    queryKey: ["floor-bookings"],
    queryFn: async () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + 24 * 3600 * 1000);
      const { data, error } = await supabase
        .from("reservations")
        .select("id, guest_name, party_size, starts_at, status, table_id, restaurant_tables(table_number)")
        .gte("starts_at", from.toISOString())
        .lt("starts_at", to.toISOString())
        .neq("status", "cancelled")
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("floor-view")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        queryClient.invalidateQueries({ queryKey: ["floor-orders"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () =>
        queryClient.invalidateQueries({ queryKey: ["floor-bookings"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function updateOrder(
    id: string,
    patch: { status?: Database["public"]["Enums"]["order_status"]; payment_status?: Database["public"]["Enums"]["payment_status"] },
  ) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["floor-orders"] });
  }

  async function seat(id: string) {
    const { error } = await supabase.from("reservations").update({ status: "seated" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["floor-bookings"] });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Service · live</p>
      <h1 className="mt-2 text-4xl text-foreground">Floor</h1>

      <section className="mt-8">
        <h2 className="text-2xl text-foreground">Tables</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {(tables ?? []).map((t) => {
            const active = (openOrders ?? []).filter((o) => o.table_id === t.id);
            const busy = active.length > 0;
            return (
              <div
                key={t.id}
                className={`rounded-lg border p-4 ${
                  busy ? "border-primary/60 bg-primary/10" : "border-border bg-card"
                }`}
              >
                <p className="font-display text-2xl text-foreground">T{t.table_number}</p>
                <p className="text-xs text-muted-foreground">
                  {t.seats} seats · {t.location}
                </p>
                <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
                  {busy ? `${active.length} open ticket${active.length > 1 ? "s" : ""}` : "Free"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-2xl text-foreground">Open tickets</h2>
          <ul className="mt-4 space-y-3">
            {(openOrders ?? []).map((o) => (
              <li key={o.id} className="warm-panel rounded-lg p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl text-foreground">#{o.order_number}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="text-xs text-muted-foreground">
                    {o.order_type === "dine_in" ? "Dine in" : "Takeaway"} · {formatTime(o.placed_at)}
                  </span>
                  <span className="ml-auto text-accent">{formatMoney(Number(o.total))}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{o.customer_name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {o.status === "ready" && (
                    <Button size="sm" onClick={() => updateOrder(o.id, { status: "served" })}>
                      Mark served
                    </Button>
                  )}
                  {o.payment_status !== "paid" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateOrder(o.id, { payment_status: "paid" })}
                    >
                      Settle bill
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {(openOrders ?? []).length === 0 && (
              <li className="text-sm text-muted-foreground">No open tickets.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl text-foreground">Today's bookings</h2>
          <ul className="mt-4 space-y-3">
            {(bookings ?? []).map((b) => (
              <li key={b.id} className="warm-panel flex items-center gap-3 rounded-lg p-4">
                <div>
                  <p className="text-foreground">
                    {b.guest_name} · {b.party_size} guests
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(b.starts_at)} · Table {b.restaurant_tables?.table_number} ·{" "}
                    {b.status}
                  </p>
                </div>
                {b.status === "confirmed" && (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => seat(b.id)}>
                    Seat
                  </Button>
                )}
              </li>
            ))}
            {(bookings ?? []).length === 0 && (
              <li className="text-sm text-muted-foreground">No bookings today.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
