import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slotSchema = z.object({
  startsAt: z.string().datetime(),
  partySize: z.number().int().min(1).max(20),
  durationMinutes: z.number().int().min(30).max(240).default(90),
});

export const findAvailableTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => slotSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const start = new Date(data.startsAt);
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const { data: tables, error: tablesError } = await supabase
      .from("restaurant_tables")
      .select("id, table_number, seats, location")
      .eq("is_active", true)
      .gte("seats", data.partySize)
      .order("table_number");
    if (tablesError) throw new Error(tablesError.message);

    const { data: booked, error: bookedError } = await supabase
      .from("reservations")
      .select("table_id, starts_at, ends_at, status")
      .neq("status", "cancelled")
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString());
    if (bookedError) throw new Error(bookedError.message);

    const takenIds = new Set((booked ?? []).map((b) => b.table_id));
    return (tables ?? []).map((t) => ({ ...t, available: !takenIds.has(t.id) }));
  });

const reservationSchema = slotSchema.extend({
  tableId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(80),
  guestPhone: z.string().trim().max(30).optional().default(""),
  notes: z.string().trim().max(300).optional().default(""),
});

export const createReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reservationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const start = new Date(data.startsAt);
    if (start.getTime() < Date.now() - 60_000) {
      throw new Error("Pick a time in the future.");
    }
    const end = new Date(start.getTime() + data.durationMinutes * 60_000);

    const { data: reservation, error } = await supabase
      .from("reservations")
      .insert({
        user_id: userId,
        table_id: data.tableId,
        guest_name: data.guestName,
        guest_phone: data.guestPhone ?? "",
        party_size: data.partySize,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: data.notes ?? "",
      })
      .select("id, starts_at, ends_at, table_id")
      .single();

    if (error) {
      // Exclusion constraint on (table_id, slot) blocks concurrent double bookings.
      if (error.code === "23P01" || error.message.includes("reservations_no_double_booking")) {
        throw new Error("That table was just booked for this slot. Please choose another table.");
      }
      throw new Error(error.message);
    }

    return { id: reservation.id };
  });
