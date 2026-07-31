import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, Leaf, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Ember & Clay" },
      {
        name: "description",
        content:
          "Small plates, wood-fired mains, clay-pot rice and desserts. Filter by category, spice level or vegetarian and order ahead.",
      },
      { property: "og:title", content: "Menu — Ember & Clay" },
      {
        property: "og:description",
        content: "Small plates, wood-fired mains and desserts at Ember & Clay.",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [vegOnly, setVegOnly] = useState(false);
  const { add } = useCart();

  const { data: categories } = useQuery({
    queryKey: ["menu-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("id, name, slug, description")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["menu-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, is_available, is_vegetarian, spice_level, prep_minutes, category_id")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (category !== "all" && i.category_id !== category) return false;
      if (vegOnly && !i.is_vegetarian) return false;
      if (q && !`${i.name} ${i.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, category, vegOnly]);

  const grouped = useMemo(() => {
    return (categories ?? [])
      .map((c) => ({ category: c, items: filtered.filter((i) => i.category_id === c.id) }))
      .filter((g) => g.items.length > 0);
  }, [categories, filtered]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Served 12:00 – 23:30</p>
      <h1 className="mt-2 text-5xl text-foreground">The menu</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Everything is cooked over live fire in the open kitchen. Add dishes to your order and choose
        dine-in or takeaway at checkout.
      </p>

      <div className="sticky top-16 z-30 -mx-4 mt-8 border-y border-border bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes"
              className="pl-9"
              maxLength={60}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
              All
            </FilterChip>
            {(categories ?? []).map((c) => (
              <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                {c.name}
              </FilterChip>
            ))}
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <Switch id="veg" checked={vegOnly} onCheckedChange={setVegOnly} />
            <Label htmlFor="veg" className="text-sm text-muted-foreground">
              Vegetarian only
            </Label>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <p className="mt-16 text-center text-muted-foreground">No dishes match those filters.</p>
      )}

      {grouped.map(({ category: cat, items: catItems }) => (
        <section key={cat.id} className="mt-14">
          <div className="flex items-baseline gap-4">
            <h2 className="text-3xl text-foreground">{cat.name}</h2>
            <span className="h-px flex-1 bg-border" />
          </div>
          {cat.description && (
            <p className="mt-2 text-sm text-muted-foreground">{cat.description}</p>
          )}
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {catItems.map((item) => (
              <article
                key={item.id}
                className="warm-panel flex flex-col overflow-hidden rounded-lg"
              >
                <div className="relative aspect-4/3 overflow-hidden bg-muted">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                  {!item.is_available && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/75">
                      <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
                        Sold out
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg leading-tight text-foreground">{item.name}</h3>
                    <span className="shrink-0 text-sm text-accent">
                      {formatMoney(Number(item.price))}
                    </span>
                  </div>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    {item.is_vegetarian && (
                      <span className="inline-flex items-center gap-1 text-success">
                        <Leaf className="size-3.5" /> Veg
                      </span>
                    )}
                    {item.spice_level > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-primary">
                        {Array.from({ length: item.spice_level }).map((_, i) => (
                          <Flame key={i} className="size-3.5" />
                        ))}
                      </span>
                    )}
                    <span className="ml-auto">{item.prep_minutes} min</span>
                  </div>
                  <Button
                    className="mt-4"
                    disabled={!item.is_available}
                    onClick={() => {
                      add({
                        menuItemId: item.id,
                        name: item.name,
                        price: Number(item.price),
                        imageUrl: item.image_url,
                      });
                      toast.success(`${item.name} added to your order`);
                    }}
                  >
                    <Plus className="size-4" /> Add to order
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
