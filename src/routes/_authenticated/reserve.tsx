import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createReservation, findAvailableTables } from "@/lib/reservations.functions";
import { useSession } from "@/hooks/useSession";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/reserve")({
  head: () => ({
    meta: [
      { title: "Reserve a table — Ember & Clay" },
      {
        name: "description",
        content: "Check live table availability and book your table at Ember & Clay.",
      },
      { property: "og:title", content: "Reserve a table — Ember & Clay" },
      { property: "og:description", content: "Live table availability at Ember & Clay." },
    ],
  }),
  component: ReservePage,
});

type Slot = { date: string; time: string; partySize: number };

function defaultSlot(): Slot {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    time: `${String(d.getHours()).padStart(2, "0")}:00`,
    partySize: 2,
  };
}

export function toIso(slot: Slot): string {
  return new Date(`${slot.date}T${slot.time}:00`).toISOString();
}

function ReservePage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const lookup = useServerFn(findAvailableTables);
  const book = useServerFn(createReservation);

  const [slot, setSlot] = useState<Slot>(defaultSlot);
  const [searched, setSearched] = useState<Slot | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busyTable, setBusyTable] = useState<string | null>(null);

  const availability = useQuery({
    queryKey: ["availability", searched],
    enabled: !!searched,
    queryFn: () =>
      lookup({
        data: {
          startsAt: toIso(searched!),
          partySize: searched!.partySize,
          durationMinutes: 90,
        },
      }),
  });

  const myReservations = useQuery({
    queryKey: ["my-reservations", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, guest_name, party_size, starts_at, status, restaurant_tables(table_number, location)")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  async function reserve(tableId: string) {
    if (!searched) return;
    if (!guestName.trim()) {
      toast.error("Add the name for the booking.");
      return;
    }
    setBusyTable(tableId);
    try {
      await book({
        data: {
          tableId,
          startsAt: toIso(searched),
          partySize: searched.partySize,
          durationMinutes: 90,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim(),
          notes: notes.trim(),
        },
      });
      toast.success("Table booked — see you soon.");
      await queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
      await availability.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not book that table.");
      await availability.refetch();
    } finally {
      setBusyTable(null);
    }
  }

  async function cancel(id: string) {
    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reservation cancelled.");
    await queryClient.invalidateQueries({ queryKey: ["my-reservations"] });
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="eyebrow">90 minute sittings</p>
        <h1 className="mt-2 text-4xl text-foreground">Reserve a table</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Availability is checked against the live floor plan. Two guests can never claim the same
          table for the same slot.
        </p>

        <form
          className="warm-panel mt-8 grid gap-4 rounded-lg p-6 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSearched({ ...slot });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              required
              value={slot.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSlot({ ...slot, date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              required
              value={slot.time}
              onChange={(e) => setSlot({ ...slot, time: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="party">Guests</Label>
            <Input
              id="party"
              type="number"
              min={1}
              max={20}
              required
              value={slot.partySize}
              onChange={(e) => setSlot({ ...slot, partySize: Number(e.target.value) })}
            />
          </div>
          <Button type="submit" className="sm:col-span-3">
            Check availability
          </Button>
        </form>

        {searched && (
          <section className="mt-8">
            <h2 className="text-2xl text-foreground">
              Tables for {searched.partySize} on {formatDateTime(toIso(searched))}
            </h2>

            <div className="warm-panel mt-4 grid gap-4 rounded-lg p-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="guest">Booking name</Label>
                <Input
                  id="guest"
                  maxLength={80}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Who is the table for?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  maxLength={30}
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="rnotes">Notes (optional)</Label>
                <Textarea
                  id="rnotes"
                  rows={2}
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Birthday, high chair, quiet corner…"
                />
              </div>
            </div>

            {availability.isFetching && (
              <p className="mt-6 text-sm text-muted-foreground">Checking the floor plan…</p>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(availability.data ?? []).map((t) => (
                <div key={t.id} className="warm-panel rounded-lg p-5">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xl text-foreground">Table {t.table_number}</h3>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {t.location}
                    </span>
                  </div>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="size-3.5" /> {t.seats} seats
                  </p>
                  <Button
                    className="mt-4 w-full"
                    variant={t.available ? "default" : "outline"}
                    disabled={!t.available || busyTable === t.id}
                    onClick={() => reserve(t.id)}
                  >
                    {t.available ? (busyTable === t.id ? "Booking…" : "Book this table") : "Taken"}
                  </Button>
                </div>
              ))}
            </div>

            {!availability.isFetching && (availability.data ?? []).length === 0 && (
              <p className="mt-6 text-sm text-muted-foreground">
                No table seats that many guests. Try a smaller party or call us.
              </p>
            )}
          </section>
        )}
      </div>

      <aside className="warm-panel h-fit rounded-lg p-6 lg:sticky lg:top-24">
        <h2 className="inline-flex items-center gap-2 text-xl text-foreground">
          <CalendarCheck className="size-5 text-primary" /> Your reservations
        </h2>
        <ul className="mt-4 space-y-4 text-sm">
          {(myReservations.data ?? []).map((r) => (
            <li key={r.id} className="border-b border-border pb-4 last:border-0">
              <p className="text-foreground">
                Table {r.restaurant_tables?.table_number} · {r.party_size} guests
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.starts_at)}</p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                {r.status}
              </p>
              {r.status === "confirmed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 px-0 text-destructive hover:text-destructive"
                  onClick={() => cancel(r.id)}
                >
                  Cancel
                </Button>
              )}
            </li>
          ))}
          {(myReservations.data ?? []).length === 0 && (
            <li className="text-muted-foreground">No reservations yet.</li>
          )}
        </ul>
      </aside>
    </div>
  );
}
