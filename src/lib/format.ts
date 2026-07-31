export const TAX_RATE = 0.05;
export const SERVICE_RATE = 0.08;

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function computeTotals(subtotal: number, discount = 0) {
  const tax = round2(subtotal * TAX_RATE);
  const serviceCharge = round2(subtotal * SERVICE_RATE);
  const total = round2(subtotal + tax + serviceCharge - discount);
  return { subtotal: round2(subtotal), tax, serviceCharge, discount: round2(discount), total };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
