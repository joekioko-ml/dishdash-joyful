import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/RoleGate";
import { AdminAnalytics } from "@/components/AdminAnalytics";

import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Ember & Clay" },
      { name: "description", content: "Manage the menu, staff roles and daily takings." },
      { property: "og:title", content: "Admin — Ember & Clay" },
      { property: "og:description", content: "Manage the menu, staff roles and takings." },
    ],
  }),
  component: () => (
    <RoleGate allow={["admin"]}>
      <AdminPage />
    </RoleGate>
  ),
});

function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Back office</p>
      <h1 className="mt-2 text-4xl text-foreground">Admin</h1>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview />
        </TabsContent>
        <TabsContent value="analytics">
          <AdminAnalytics />
        </TabsContent>
        <TabsContent value="menu">
          <MenuAdmin />
        </TabsContent>
        <TabsContent value="staff">
          <StaffAdmin />
        </TabsContent>
      </Tabs>

    </div>
  );
}

function Overview() {
  const { data } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const [orders, reservations] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total, status, payment_status, placed_at")
          .gte("placed_at", since.toISOString()),
        supabase
          .from("reservations")
          .select("id, status")
          .gte("starts_at", since.toISOString())
          .neq("status", "cancelled"),
      ]);
      if (orders.error) throw orders.error;
      if (reservations.error) throw reservations.error;
      const rows = orders.data ?? [];
      const paid = rows.filter((o) => o.payment_status === "paid");
      return {
        orderCount: rows.length,
        revenue: paid.reduce((sum, o) => sum + Number(o.total), 0),
        openTickets: rows.filter((o) => ["placed", "preparing", "ready"].includes(o.status)).length,
        bookings: (reservations.data ?? []).length,
      };
    },
  });

  const cards = [
    { label: "Orders today", value: data?.orderCount ?? 0 },
    { label: "Revenue today", value: formatMoney(data?.revenue ?? 0) },
    { label: "Open tickets", value: data?.openTickets ?? 0 },
    { label: "Bookings today", value: data?.bookings ?? 0 },
  ];

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="warm-panel rounded-lg p-6">
          <p className="eyebrow">{c.label}</p>
          <p className="mt-3 font-display text-4xl text-foreground">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function MenuAdmin() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["menu-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("id, name")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["admin-menu-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, is_available, category_id")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-menu-items"] });
    await queryClient.invalidateQueries({ queryKey: ["menu-items"] });
  }

  async function toggle(id: string, isAvailable: boolean) {
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: isAvailable })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
  }

  async function updatePrice(id: string, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a valid price.");
      return;
    }
    const { error } = await supabase.from("menu_items").update({ price: parsed }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Price updated.");
    await refresh();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(price);
    if (!name.trim() || !categoryId || !Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Name, category and a valid price are required.");
      return;
    }
    const { error } = await supabase.from("menu_items").insert({
      name: name.trim(),
      description: description.trim(),
      price: parsed,
      category_id: categoryId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dish added to the menu.");
    setName("");
    setDescription("");
    setPrice("");
    await refresh();
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="warm-panel rounded-lg">
        <ul className="divide-y divide-border">
          {(items ?? []).map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-40 flex-1">
                <p className="text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {categories?.find((c) => c.id === item.category_id)?.name}
                </p>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                defaultValue={Number(item.price)}
                className="h-9 w-28"
                onBlur={(e) => {
                  if (Number(e.target.value) !== Number(item.price)) {
                    updatePrice(item.id, e.target.value);
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={item.is_available}
                  onCheckedChange={(v) => toggle(item.id, v)}
                  aria-label={`Toggle availability for ${item.name}`}
                />
                <span className="w-20 text-xs text-muted-foreground">
                  {item.is_available ? "Available" : "Sold out"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={addItem} className="warm-panel h-fit space-y-4 rounded-lg p-6">
        <h2 className="text-xl text-foreground">Add a dish</h2>
        <div className="space-y-2">
          <Label htmlFor="dish-name">Name</Label>
          <Input
            id="dish-name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dish-cat">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="dish-cat">
              <SelectValue placeholder="Choose a section" />
            </SelectTrigger>
            <SelectContent>
              {(categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dish-price">Price</Label>
          <Input
            id="dish-price"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dish-desc">Description</Label>
          <Textarea
            id="dish-desc"
            rows={3}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full">
          Add to menu
        </Button>
      </form>
    </div>
  );
}

function StaffAdmin() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const { data: people } = useQuery({
    queryKey: ["admin-people"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at"),
        supabase.from("user_roles").select("id, user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return (profiles.data ?? []).map((p) => ({
        ...p,
        roles: (roles.data ?? []).filter((r) => r.user_id === p.id),
      }));
    },
  });

  async function grant(userId: string, role: AppRole) {
    setPending(userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    setPending(null);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "They already have that role." : error.message);
      return;
    }
    toast.success(`Granted ${role}.`);
    await queryClient.invalidateQueries({ queryKey: ["admin-people"] });
  }

  async function revoke(roleRowId: string) {
    const { error } = await supabase.from("user_roles").delete().eq("id", roleRowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["admin-people"] });
  }

  return (
    <div className="warm-panel mt-6 rounded-lg">
      <ul className="divide-y divide-border">
        {(people ?? []).map((person) => (
          <li key={person.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-48 flex-1">
              <p className="text-foreground">{person.full_name ?? "Unnamed guest"}</p>
              <p className="text-xs text-muted-foreground">{person.phone ?? person.id.slice(0, 8)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {person.roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => revoke(r.id)}
                  title="Remove role"
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs uppercase tracking-widest text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  {r.role} ×
                </button>
              ))}
            </div>
            <Select
              disabled={pending === person.id}
              onValueChange={(v) => grant(person.id, v as AppRole)}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Grant role" />
              </SelectTrigger>
              <SelectContent>
                {(["admin", "chef", "waiter", "customer"] as AppRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
        {(people ?? []).length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">No people yet.</li>
        )}
      </ul>
    </div>
  );
}
