import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const placeOrderSchema = z.object({
  orderType: z.enum(["dine_in", "takeaway"]),
  tableId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(400).optional().default(""),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(30),
        notes: z.string().trim().max(160).optional().default(""),
      }),
    )
    .min(1)
    .max(40),
});

const TAX_RATE = 0.05;
const SERVICE_RATE = 0.08;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => placeOrderSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const ids = data.items.map((i) => i.menuItemId);
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id, name, price, is_available")
      .in("id", ids);
    if (menuError) throw new Error(menuError.message);

    const unavailable = (menuItems ?? []).filter((m) => !m.is_available);
    if (unavailable.length > 0) {
      throw new Error(`No longer available: ${unavailable.map((m) => m.name).join(", ")}`);
    }
    if ((menuItems ?? []).length !== ids.length) {
      throw new Error("One or more dishes could not be found on the menu.");
    }

    // Prices always come from the database, never from the browser.
    const priced = data.items.map((line) => {
      const item = menuItems!.find((m) => m.id === line.menuItemId)!;
      return {
        menu_item_id: item.id,
        item_name: item.name,
        unit_price: Number(item.price),
        quantity: line.quantity,
        notes: line.notes ?? "",
      };
    });

    const subtotal = round2(priced.reduce((sum, l) => sum + l.unit_price * l.quantity, 0));
    const tax = round2(subtotal * TAX_RATE);
    const serviceCharge = round2(subtotal * SERVICE_RATE);
    const total = round2(subtotal + tax + serviceCharge);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        order_type: data.orderType,
        table_id: data.orderType === "dine_in" ? (data.tableId ?? null) : null,
        customer_name: data.customerName,
        notes: data.notes ?? "",
        subtotal,
        tax,
        service_charge: serviceCharge,
        discount: 0,
        total,
      })
      .select("id, order_number, total")
      .single();
    if (orderError) throw new Error(orderError.message);

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(priced.map((l) => ({ ...l, order_id: order.id })));
    if (itemsError) throw new Error(itemsError.message);

    return { id: order.id, orderNumber: order.order_number, total: Number(order.total) };
  });

export const payForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", data.orderId)
      .eq("user_id", userId)
      .select("id, payment_status")
      .single();
    if (error) throw new Error(error.message);
    return { id: order.id, paymentStatus: order.payment_status };
  });
