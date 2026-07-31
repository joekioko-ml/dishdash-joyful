# Restaurant Management System — Phase 1

A full-stack restaurant platform with customer ordering and staff operations, built on Lovable Cloud (Postgres database, auth, server functions, realtime). Warm modern bistro look: deep charcoal base, terracotta and amber accents, editorial serif headings on a clean sans body.

## What Phase 1 delivers

**Accounts and roles**
- Email/password sign-up and sign-in, plus Google sign-in.
- Four roles: admin, chef, waiter, customer. Roles live in a dedicated roles table (never on the profile) and are enforced by database policies, not just UI.
- New sign-ups default to customer. Admins promote staff from the admin area.

**Menu**
- Dishes with name, category, description, price, availability toggle and image.
- Customer-facing menu with search, category filter, veg/availability filter.
- Admin can create, edit, disable and delete dishes.

**Cart and orders**
- Add to cart, adjust quantity, add per-item notes ("less spicy").
- Order type: dine-in (with table) or takeaway.
- Checkout creates an order with line items, subtotal, GST, service charge and grand total.
- Simulated payment: a checkout screen that marks the order paid without a real gateway. Real Stripe/Paddle can be added later without changing the order model.

**Table reservations**
- Tables with number, seat capacity, location.
- Customer picks date, time slot and guest count, then sees only genuinely free tables.
- Double-booking is prevented at the database level with an overlap constraint, so two simultaneous requests cannot both succeed.

**Kitchen dashboard (chef)**
- Live queue of incoming orders grouped by status: Placed, Preparing, Ready, Served.
- One-tap status advance; new orders and status changes appear instantly for every connected staff device via Cloud realtime.

**Waiter view**
- Floor overview of tables and their current order/reservation state, mark orders served, take a dine-in order on a customer's behalf.

**Admin basics**
- Menu management, staff role management, today's orders and revenue at a glance.

**Everything is responsive** and works on phone, tablet and desktop, with dark mode built into the theme.

## Deferred to Phase 2 (not built now)

Real payment gateway, inventory and suppliers, downloadable PDF invoices, full analytics reports, notifications/push, loyalty, delivery tracking, QR menu, AI recommendations.

## Technical notes

- Stack is this project's TanStack Start + React + Tailwind v4 setup with Lovable Cloud (Postgres) behind it — that replaces the Express/Mongo/Socket.IO stack in the brief. Auth is handled by Cloud (JWT under the hood, no hand-rolled bcrypt), and live kitchen updates use Cloud realtime subscriptions instead of Socket.IO. Same behaviour, less infrastructure.
- Tables: `profiles`, `user_roles` + `app_role` enum + `has_role()` security-definer function, `menu_categories`, `menu_items`, `restaurant_tables`, `reservations`, `orders`, `order_items`.
- Reservation integrity: `tstzrange` slot column with a `btree_gist` exclusion constraint on (table_id, slot) for non-cancelled rows.
- Every table gets explicit grants plus row-level security: customers read the menu and only their own orders/reservations; chefs and waiters read and update order status; admins manage everything.
- Order totals are computed and stored server-side in a server function, never trusted from the client.
- Routes: `/` (landing), `/menu`, `/reserve`, `/cart`, `/checkout`, `/orders`, `/orders/$id`, `/auth`, and gated `/kitchen`, `/floor`, `/admin/*`.
- Seed data ships in the migration: categories, ~18 dishes with generated images, 12 tables, so the app is usable the moment it loads.
- Design tokens: charcoal `#1a1a1a` surfaces, terracotta `#c4654a`, ember `#e85d3a`, amber `#e8b84a`; DM Serif Display headings with Fira Sans body, loaded via a link tag in the root route.
