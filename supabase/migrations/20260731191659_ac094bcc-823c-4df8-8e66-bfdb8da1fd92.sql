-- Extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'chef', 'waiter', 'customer');
CREATE TYPE public.order_status AS ENUM ('placed', 'preparing', 'ready', 'served', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'refunded');
CREATE TYPE public.order_type AS ENUM ('dine_in', 'takeaway');
CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'seated', 'completed', 'cancelled');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','chef','waiter'));
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- new user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ menu ============
CREATE TABLE public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT ALL ON public.menu_categories TO service_role;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.menu_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories_admin_write" ON public.menu_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  is_vegetarian BOOLEAN NOT NULL DEFAULT false,
  spice_level INT NOT NULL DEFAULT 0 CHECK (spice_level BETWEEN 0 AND 3),
  is_available BOOLEAN NOT NULL DEFAULT true,
  prep_minutes INT NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_category_idx ON public.menu_items(category_id);
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menu_public_read" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "menu_admin_write" ON public.menu_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER menu_items_updated BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ tables ============
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number INT NOT NULL UNIQUE,
  seats INT NOT NULL CHECK (seats > 0),
  location TEXT NOT NULL DEFAULT 'Main Hall',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.restaurant_tables TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables_public_read" ON public.restaurant_tables FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "tables_admin_write" ON public.restaurant_tables FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ reservations ============
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  party_size INT NOT NULL CHECK (party_size > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  slot TSTZRANGE GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status public.reservation_status NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_double_booking
  EXCLUDE USING gist (table_id WITH =, slot WITH &&)
  WHERE (status <> 'cancelled');
CREATE INDEX reservations_user_idx ON public.reservations(user_id);
GRANT SELECT, INSERT, UPDATE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations_select" ON public.reservations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "reservations_insert_own" ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "reservations_update" ON public.reservations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE TRIGGER reservations_updated BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ orders ============
CREATE SEQUENCE public.order_number_seq START 1001;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO authenticated, service_role;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number INT NOT NULL UNIQUE DEFAULT nextval('public.order_number_seq'),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_type public.order_type NOT NULL DEFAULT 'dine_in',
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'placed',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  customer_name TEXT,
  notes TEXT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON public.orders(user_id);
CREATE INDEX orders_status_idx ON public.orders(status);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_staff(auth.uid()))));
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.reservations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

-- ============ seed ============
INSERT INTO public.menu_categories (name, slug, description, sort_order) VALUES
  ('Starters', 'starters', 'Small plates to begin the evening', 1),
  ('Main Course', 'main-course', 'Slow-cooked house signatures', 2),
  ('Breads & Rice', 'breads-rice', 'From the tandoor and the pot', 3),
  ('Desserts', 'desserts', 'Sweet endings', 4),
  ('Beverages', 'beverages', 'Cold pressed and freshly brewed', 5),
  ('Chef''s Specials', 'chefs-specials', 'Limited plates from the pass', 6);

INSERT INTO public.menu_items (category_id, name, description, price, is_vegetarian, spice_level, prep_minutes, image_url)
SELECT c.id, v.name, v.description, v.price, v.veg, v.spice, v.prep, v.img
FROM (VALUES
  ('starters','Tandoori Paneer Tikka','Charred cottage cheese, hung curd marinade, mint chutney',329,true,1,14,'/dishes/paneer-tikka.jpg'),
  ('starters','Coriander Chicken Wings','Twice-cooked wings, green chilli butter, lime',389,false,2,16,'/dishes/chicken-wings.jpg'),
  ('starters','Beetroot & Walnut Kebab','Smoked beetroot, toasted walnut, pomegranate',299,true,0,12,'/dishes/beetroot-kebab.jpg'),
  ('starters','Chilli Garlic Prawns','Tiger prawns, burnt garlic, curry leaf',549,false,3,15,'/dishes/chilli-prawns.jpg'),
  ('main-course','Shahi Paneer','Cottage cheese in a cashew and saffron gravy',299,true,1,20,'/dishes/shahi-paneer.jpg'),
  ('main-course','Butter Chicken','Overnight marinated chicken, tomato butter gravy',429,false,1,22,'/dishes/butter-chicken.jpg'),
  ('main-course','Lamb Rogan Josh','Slow braised lamb shoulder, Kashmiri chilli',549,false,2,35,'/dishes/rogan-josh.jpg'),
  ('main-course','Dal Makhani','Black lentils simmered twelve hours, white butter',279,true,0,18,'/dishes/dal-makhani.jpg'),
  ('main-course','Malabar Fish Curry','Kingfish, coconut, raw mango, curry leaf',489,false,2,24,'/dishes/fish-curry.jpg'),
  ('breads-rice','Truffle Garlic Naan','Tandoor naan, garlic confit, truffle oil',149,true,0,8,'/dishes/garlic-naan.jpg'),
  ('breads-rice','Laccha Paratha','Hand-layered whole wheat paratha',99,true,0,8,'/dishes/paratha.jpg'),
  ('breads-rice','Hyderabadi Dum Biryani','Sealed clay pot, long grain rice, saffron',449,false,2,30,'/dishes/biryani.jpg'),
  ('breads-rice','Burnt Garlic Fried Rice','Wok tossed rice, spring onion, chilli oil',249,true,1,14,'/dishes/fried-rice.jpg'),
  ('desserts','Gulab Jamun Cheesecake','Baked cheesecake, rose syrup, pistachio',249,true,0,6,'/dishes/gulab-cheesecake.jpg'),
  ('desserts','Dark Chocolate Fondant','Molten centre, salted caramel, vanilla ice cream',279,true,0,12,'/dishes/fondant.jpg'),
  ('beverages','Masala Chai','Slow brewed Assam, ginger, cardamom',99,true,0,5,'/dishes/masala-chai.jpg'),
  ('beverages','Kokum Cooler','Kokum, black salt, soda, basil',169,true,0,4,'/dishes/kokum-cooler.jpg'),
  ('chefs-specials','Smoked Lamb Chops','Coal smoked chops, burnt onion jus',699,false,2,28,'/dishes/lamb-chops.jpg')
) AS v(cat,name,description,price,veg,spice,prep,img)
JOIN public.menu_categories c ON c.slug = v.cat;

INSERT INTO public.restaurant_tables (table_number, seats, location)
SELECT n,
  CASE WHEN n <= 4 THEN 2 WHEN n <= 9 THEN 4 ELSE 8 END,
  CASE WHEN n <= 4 THEN 'Window' WHEN n <= 9 THEN 'Main Hall' ELSE 'Terrace' END
FROM generate_series(1,12) AS n;