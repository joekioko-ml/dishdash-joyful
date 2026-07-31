import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  imageUrl: string | null;
};

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity" | "notes"> & { quantity?: number }) => void;
  setQuantity: (menuItemId: string, quantity: number) => void;
  setNotes: (menuItemId: string, notes: string) => void;
  remove: (menuItemId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "ember-clay-cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      /* ignore malformed cart */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  const add = useCallback<CartContextValue["add"]>((line) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === line.menuItemId);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === line.menuItemId
            ? { ...l, quantity: l.quantity + (line.quantity ?? 1) }
            : l,
        );
      }
      return [...prev, { ...line, quantity: line.quantity ?? 1, notes: "" }];
    });
  }, []);

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.menuItemId !== menuItemId)
        : prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity } : l)),
    );
  }, []);

  const setNotes = useCallback((menuItemId: string, notes: string) => {
    setLines((prev) => prev.map((l) => (l.menuItemId === menuItemId ? { ...l, notes } : l)));
  }, []);

  const remove = useCallback((menuItemId: string) => {
    setLines((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, l) => sum + l.quantity, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.price, 0);
    return { lines, count, subtotal, add, setQuantity, setNotes, remove, clear };
  }, [lines, add, setQuantity, setNotes, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
