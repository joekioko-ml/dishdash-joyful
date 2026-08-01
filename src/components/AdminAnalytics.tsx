import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

type Row = {
  id: string;
  total: number | string;
  subtotal: number | string;
  tax: number | string;
  service_charge: number | string;
  status: string;
  payment_status: string;
  order_type: string;
  placed_at: string;
  order_items: { item_name: string; quantity: number; unit_price: number | string }[];
};

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function shortDay(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminAnalytics() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (days - 1));
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, total, subtotal, tax, service_charge, status, payment_status, order_type, placed_at, order_items(item_name, quantity, unit_price)",
        )
        .gte("placed_at", since.toISOString())
        .order("placed_at", { ascending: true });
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], since };
    },
  });

  const analytics = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => r.status !== "cancelled");
    const since = data?.since ?? new Date();

    const buckets = new Map<
      string,
      { day: string; revenue: number; orders: number; dineIn: number; takeaway: number }
    >();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { day: key, revenue: 0, orders: 0, dineIn: 0, takeaway: 0 });
    }

    const dishes = new Map<string, { name: string; quantity: number; revenue: number }>();
    let revenue = 0;
    let paidRevenue = 0;
    let itemCount = 0;

    for (const r of rows) {
      const key = dayKey(r.placed_at);
      const b = buckets.get(key);
      const total = Number(r.total);
      revenue += total;
      if (r.payment_status === "paid") paidRevenue += total;
      if (b) {
        b.revenue += total;
        b.orders += 1;
        if (r.order_type === "dine_in") b.dineIn += 1;
        else b.takeaway += 1;
      }
      for (const item of r.order_items ?? []) {
        itemCount += item.quantity;
        const prev = dishes.get(item.item_name) ?? {
          name: item.item_name,
          quantity: 0,
          revenue: 0,
        };
        prev.quantity += item.quantity;
        prev.revenue += Number(item.unit_price) * item.quantity;
        dishes.set(item.item_name, prev);
      }
    }

    const daily = [...buckets.values()];
    const topDishes = [...dishes.values()].sort((a, b) => b.quantity - a.quantity);
    const activeDays = daily.filter((d) => d.orders > 0).length || 1;

    return {
      daily,
      topDishes,
      revenue,
      paidRevenue,
      itemCount,
      orderCount: rows.length,
      avgTicket: rows.length ? revenue / rows.length : 0,
      avgPerDay: revenue / activeDays,
    };
  }, [data, days]);

  const cards = [
    { label: "Revenue", value: formatMoney(analytics.revenue) },
    { label: "Collected", value: formatMoney(analytics.paidRevenue) },
    { label: "Orders", value: String(analytics.orderCount) },
    { label: "Avg ticket", value: formatMoney(analytics.avgTicket) },
    { label: "Dishes sold", value: String(analytics.itemCount) },
    { label: "Avg / trading day", value: formatMoney(analytics.avgPerDay) },
  ];

  function exportDaily() {
    downloadCsv(`daily-sales-${days}d.csv`, [
      ["Date", "Orders", "Dine in", "Takeaway", "Revenue"],
      ...analytics.daily.map((d) => [d.day, d.orders, d.dineIn, d.takeaway, d.revenue.toFixed(2)]),
    ]);
  }

  function exportDishes() {
    downloadCsv(`popular-dishes-${days}d.csv`, [
      ["Dish", "Quantity", "Revenue"],
      ...analytics.topDishes.map((d) => [d.name, d.quantity, d.revenue.toFixed(2)]),
    ]);
  }

  function exportOrders() {
    downloadCsv(`orders-${days}d.csv`, [
      ["Order id", "Placed at", "Type", "Status", "Payment", "Subtotal", "Tax", "Service", "Total"],
      ...(data?.rows ?? []).map((r) => [
        r.id,
        r.placed_at,
        r.order_type,
        r.status,
        r.payment_status,
        Number(r.subtotal).toFixed(2),
        Number(r.tax).toFixed(2),
        Number(r.service_charge).toFixed(2),
        Number(r.total).toFixed(2),
      ]),
    ]);
  }

  const axisStyle = { fontSize: 11, fill: "var(--color-muted-foreground)" } as const;
  const grid = "color-mix(in oklch, var(--color-border) 70%, transparent)";

  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-1">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "ghost"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportDaily}>
            <Download className="size-4" /> Daily sales
          </Button>
          <Button size="sm" variant="outline" onClick={exportDishes}>
            <Download className="size-4" /> Dishes
          </Button>
          <Button size="sm" variant="outline" onClick={exportOrders}>
            <Download className="size-4" /> Orders
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="warm-panel rounded-lg p-5">
            <p className="eyebrow">{c.label}</p>
            <p className="mt-2 font-display text-3xl text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="warm-panel rounded-lg p-5">
        <h2 className="text-xl text-foreground">Revenue trend</h2>
        <p className="text-sm text-muted-foreground">Gross takings per day</p>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.daily} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={axisStyle} tickLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={60} />
              <Tooltip
                labelFormatter={(v) => shortDay(String(v))}
                formatter={(v: number) => [formatMoney(v), "Revenue"]}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-foreground)",
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#revFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="warm-panel rounded-lg p-5">
        <h2 className="text-xl text-foreground">Daily sales mix</h2>
        <p className="text-sm text-muted-foreground">Orders per day by service type</p>
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.daily} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={axisStyle} tickLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: grid }}
                labelFormatter={(v) => shortDay(String(v))}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                name="Dine in"
                dataKey="dineIn"
                stackId="a"
                fill="var(--color-primary)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                name="Takeaway"
                dataKey="takeaway"
                stackId="a"
                fill="var(--color-accent)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="warm-panel rounded-lg p-5">
        <h2 className="text-xl text-foreground">Popular dishes</h2>
        <p className="text-sm text-muted-foreground">Top sellers by quantity</p>
        {analytics.topDishes.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No sales in this period yet.
          </p>
        ) : (
          <>
            <div className="mt-4 h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={analytics.topDishes.slice(0, 8)}
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid stroke={grid} horizontal={false} />
                  <XAxis type="number" tick={axisStyle} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={axisStyle}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: grid }}
                    formatter={(v: number) => [String(v), "Sold"]}
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-foreground)",
                    }}
                  />
                  <Bar dataKey="quantity" radius={[0, 4, 4, 0]}>
                    {analytics.topDishes.slice(0, 8).map((d, i) => (
                      <Cell
                        key={d.name}
                        fill={i === 0 ? "var(--color-accent)" : "var(--color-primary)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 font-normal">Dish</th>
                    <th className="py-2 text-right font-normal">Sold</th>
                    <th className="py-2 text-right font-normal">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topDishes.slice(0, 12).map((d) => (
                    <tr key={d.name} className="border-b border-border/60">
                      <td className="py-2 text-foreground">{d.name}</td>
                      <td className="py-2 text-right text-foreground">{d.quantity}</td>
                      <td className="py-2 text-right text-accent">{formatMoney(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="warm-panel rounded-lg p-5">
        <h2 className="text-xl text-foreground">Average ticket trend</h2>
        <p className="text-sm text-muted-foreground">Revenue divided by orders each day</p>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={analytics.daily.map((d) => ({
                day: d.day,
                avg: d.orders ? d.revenue / d.orders : 0,
              }))}
              margin={{ left: 4, right: 8, top: 8 }}
            >
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={axisStyle} tickLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={60} />
              <Tooltip
                labelFormatter={(v) => shortDay(String(v))}
                formatter={(v: number) => [formatMoney(v), "Avg ticket"]}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-foreground)",
                }}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
