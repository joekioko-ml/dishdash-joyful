import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChefHat, Clock, UtensilsCrossed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ember & Clay — Wood-fired bistro, book a table" },
      {
        name: "description",
        content:
          "Wood-fired plates and a short natural wine list. Browse the menu, order ahead for pickup or your table, and reserve online at Ember & Clay.",
      },
      { property: "og:title", content: "Ember & Clay — Wood-fired bistro" },
      {
        property: "og:description",
        content: "Browse the menu, order ahead, and reserve a table at Ember & Clay.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: featured } = useQuery({
    queryKey: ["featured-dishes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url")
        .eq("is_available", true)
        .order("price", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <img
          src="/hero-dining-room.jpg"
          alt="The candlelit dining room at Ember & Clay"
          width={1920}
          height={1080}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col justify-end px-4 pb-20 pt-32 sm:px-6 sm:pb-28 sm:pt-44">
          <p className="eyebrow">Kiln Street · Since 2014</p>
          <h1 className="mt-4 max-w-2xl text-5xl leading-[1.05] text-foreground sm:text-7xl">
            Wood fire, clay pots, and a table with your name on it.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A short seasonal menu cooked over open flame. Reserve a table, order ahead for pickup, or
            send your order straight to the pass while you're seated.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/reserve">Reserve a table</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/menu">See the menu</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              icon: UtensilsCrossed,
              title: "Order from the table",
              body: "Scan, browse, and send your order to the kitchen without waving anyone down.",
            },
            {
              icon: CalendarDays,
              title: "Live table availability",
              body: "Reservations check the floor plan in real time — no double bookings, ever.",
            },
            {
              icon: ChefHat,
              title: "Straight to the pass",
              body: "Every ticket lands on the kitchen board the second it's placed.",
            },
          ].map((f) => (
            <div key={f.title} className="warm-panel rounded-lg p-6">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-xl text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">From the fire</p>
            <h2 className="mt-2 text-4xl text-foreground">Tonight's larger plates</h2>
          </div>
          <Link to="/menu" className="hidden text-sm text-primary hover:underline sm:block">
            Full menu →
          </Link>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {(featured ?? []).map((dish) => (
            <Link
              key={dish.id}
              to="/menu"
              className="group warm-panel overflow-hidden rounded-lg transition-colors hover:border-primary/50"
            >
              <div className="aspect-4/3 overflow-hidden bg-muted">
                {dish.image_url && (
                  <img
                    src={dish.image_url}
                    alt={dish.name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </div>
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg text-foreground">{dish.name}</h3>
                  <span className="text-sm text-accent">{formatMoney(Number(dish.price))}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{dish.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4">
            <Clock className="size-6 text-primary" />
            <div>
              <h2 className="text-2xl text-foreground">Kitchen open until 23:30</h2>
              <p className="text-sm text-muted-foreground">
                Last reservations at 22:00. Takeaway pickup until 23:00.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/reserve">Check availability</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
