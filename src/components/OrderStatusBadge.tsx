import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

const LABELS: Record<OrderStatus, { label: string; className: string }> = {
  placed: { label: "Placed", className: "border-border text-muted-foreground" },
  preparing: { label: "In the pans", className: "border-primary/60 bg-primary/10 text-primary" },
  ready: { label: "Ready", className: "border-accent/60 bg-accent/10 text-accent" },
  served: { label: "Served", className: "border-success/60 bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "border-destructive/60 bg-destructive/10 text-destructive" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = LABELS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs uppercase tracking-widest ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export const ORDER_STATUS_FLOW: OrderStatus[] = ["placed", "preparing", "ready", "served"];
