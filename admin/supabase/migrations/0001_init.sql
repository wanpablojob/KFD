-- ============================================================================
-- KFD — Kabankalan City Food Delivery · Supabase schema
-- Run this file in the Supabase SQL Editor (or via `supabase db push`).
-- ============================================================================

-- --------------------------------------------------------------------------
-- Enums (mirror the TypeScript discriminated unions in src/lib/types.ts)
-- --------------------------------------------------------------------------

create type order_status as enum (
  'pending',
  'confirmed',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled'
);

create type payment_method as enum ('cash', 'card', 'e_wallet');

create type restaurant_status as enum ('active', 'approval', 'suspended');

create type rider_status as enum ('online', 'busy', 'offline');

create type vehicle_type as enum ('bicycle', 'scooter', 'motorcycle', 'car');

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

create table restaurants (
  id text primary key,
  name text not null,
  cuisine text not null,
  city text not null default 'Kabankalan City Proper',
  rating numeric(3, 1) not null default 0,
  orders_count integer not null default 0,
  revenue numeric(12, 2) not null default 0,
  status restaurant_status not null default 'active',
  joined_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table riders (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text,
  city text not null default 'Kabankalan City Proper',
  vehicle vehicle_type not null default 'motorcycle',
  status rider_status not null default 'offline',
  deliveries integer not null default 0,
  rating numeric(3, 1) not null default 0,
  earnings numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table customers (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text,
  city text not null default 'Kabankalan City Proper',
  orders_count integer not null default 0,
  total_spend numeric(12, 2) not null default 0,
  joined_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table menu_items (
  id text primary key,
  restaurant text not null,
  name text not null,
  category text not null,
  price numeric(10, 2) not null default 0,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table orders (
  id text primary key,
  reference text not null,
  customer text not null,
  restaurant text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status order_status not null default 'pending',
  payment payment_method not null default 'cash',
  placed_at timestamptz not null default now(),
  rider text,
  created_at timestamptz not null default now()
);

create index orders_placed_at_idx on orders (placed_at desc);
create index orders_status_idx on orders (status);
create index menu_items_restaurant_idx on menu_items (restaurant);

-- --------------------------------------------------------------------------
-- Row Level Security
-- Only signed-in users (authenticated role) may read/write admin data.
-- The publishable key is safe in the browser; RLS keeps data private.
-- --------------------------------------------------------------------------

alter table restaurants enable row level security;
alter table riders enable row level security;
alter table customers enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;

create policy "authenticated full access: restaurants"
  on restaurants for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access: riders"
  on riders for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access: customers"
  on customers for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access: menu_items"
  on menu_items for all
  to authenticated
  using (true) with check (true);

create policy "authenticated full access: orders"
  on orders for all
  to authenticated
  using (true) with check (true);

-- --------------------------------------------------------------------------
-- Seed data (Kabankalan City Proper)
-- --------------------------------------------------------------------------

insert into restaurants (id, name, cuisine, rating, orders_count, revenue, status, joined_at) values
  ('rst_01', 'D & D Food Hub', 'Filipino-Homecooked', 4.6, 1482, 45120.00, 'active',   '2025-03-14'),
  ('rst_02', 'Master Lechon House', 'Filipino',           4.8, 1271, 39880.00, 'active',   '2025-06-02'),
  ('rst_03', 'Ristorante Gio', 'Italian-Amer',           4.3, 985,  27620.00, 'approval', '2026-01-20'),
  ('rst_04', 'Kalkan', 'Seafood-Grill',        4.5, 764,  21930.00, 'active',   '2025-09-11'),
  ('rst_05', 'Habhab (Kabankalan)', 'Balayan-Bulalo',    4.7, 1120, 33410.00, 'active',   '2025-04-25'),
  ('rst_06', 'Koumi', 'Japanese',             4.2, 654,  19820.00, 'suspended', '2025-11-08');

insert into riders (id, name, email, phone, vehicle, status, deliveries, rating, earnings) values
  ('rdr_01', 'Juan Dela Cruz',      'juan.delacruz@kfd.ph',   '+63 917 000 1001', 'motorcycle', 'online', 182, 4.9, 2840.00),
  ('rdr_02', 'Anna Reyes',          'anna.reyes@kfd.ph',      '+63 918 000 1002', 'scooter',    'busy',   156, 4.7, 2510.00),
  ('rdr_03', 'Miguel Torres',       'miguel.torres@kfd.ph',   '+63 919 000 1003', 'motorcycle', 'online', 210, 4.8, 3220.00),
  ('rdr_04', 'Liza Mendoza',        'liza.mendoza@kfd.ph',    '+63 920 000 1004', 'bicycle',    'offline', 98, 4.5, 1730.00),
  ('rdr_05', 'Carlo Bautista',      'carlo.bautista@kfd.ph',  '+63 921 000 1005', 'car',        'online', 174, 4.6, 2950.00);

insert into customers (id, name, email, phone, orders_count, total_spend, joined_at) values
  ('cus_01', 'Maria Santos',   'maria.santos@gmail.com',   '+63 917 555 0101', 34, 462.50, '2025-02-10'),
  ('cus_02', 'Grace Tan',      'grace.tan@yahoo.com',      '+63 918 555 0102', 27, 388.20, '2025-05-19'),
  ('cus_03', 'Daniel Cruz',    'daniel.cruz@gmail.com',    '+63 919 555 0103', 19, 245.00, '2025-08-01'),
  ('cus_04', 'Angela Lim',     'angela.lim@gmail.com',     '+63 920 555 0104', 42, 610.80, '2024-12-03'),
  ('cus_05', 'Paolo Gonzales', 'paolo.g@gmail.com',        '+63 921 555 0105', 12, 156.40, '2026-01-22');

insert into menu_items (id, restaurant, name, category, price, available) values
  ('mnu_01', 'D & D Food Hub',       'Inihaw na Liempo',         'Grill',  8.50,  true),
  ('mnu_02', 'Master Lechon House',  'Whole Lechon (per kg)',    'Lechon', 12.00, true),
  ('mnu_03', 'Ristorante Gio',       'Spaghetti Bolognese',      'Pasta',  7.00,  true),
  ('mnu_04', 'Kalkan',               'Grilled Blue Marlin',      'Seafood', 9.80, true),
  ('mnu_05', 'Habhab (Kabankalan)',  'Bulalo Bowl',              'Soup',   11.50, false),
  ('mnu_06', 'Koumi',                'Chicken Teriyaki',         'Japanese', 9.00, true),
  ('mnu_07', 'D & D Food Hub',       'Pinakbet',                 'Viand',  9.20,  true),
  ('mnu_08', 'Master Lechon House',  'Lechon Paksiw',            'Lechon', 10.50, true),
  ('mnu_09', 'Ristorante Gio',       'Pizza Margherita',         'Pizza',  8.20,  true),
  ('mnu_10', 'Habhab (Kabankalan)',  'KBL (Kadios, Baboy, Langka)', 'Soup', 3.20, true),
  ('mnu_11', 'Kalkan',               'Seafood Platter',          'Seafood', 6.00, true),
  ('mnu_12', 'Koumi',                'Salmon Sashimi',           'Japanese', 10.50, false);

insert into orders (id, reference, customer, restaurant, items, subtotal, delivery_fee, total, status, payment, placed_at, rider) values
  ('ord_1001', '#KFD-1001', 'Maria Santos',   'D & D Food Hub',      '[{"name":"Inihaw na Liempo","quantity":2,"price":8.5}]',                    19.50, 1.90, 21.40, 'delivered',      'card',    now() - interval '90 minutes', 'Juan Dela Cruz'),
  ('ord_1002', '#KFD-1002', 'Jose Ramirez',   'Master Lechon House', '[{"name":"Whole Lechon (per kg)","quantity":1,"price":12.0}]',              12.00, 1.50, 13.50, 'out_for_delivery','cash',   now() - interval '4 hours', 'Anna Reyes'),
  ('ord_1003', '#KFD-1003', 'Grace Tan',      'Ristorante Gio',      '[{"name":"Spaghetti Bolognese","quantity":2,"price":7.0}]',                14.00, 2.50, 16.50, 'preparing',      'e_wallet', now() - interval '6 hours', 'Miguel Torres'),
  ('ord_1004', '#KFD-1004', 'Daniel Cruz',    'Kalkan',              '[{"name":"Grilled Blue Marlin","quantity":1,"price":9.8}]',                 9.80,  1.20, 11.00, 'confirmed',      'card',    now() - interval '1 day', 'Liza Mendoza'),
  ('ord_1005', '#KFD-1005', 'Angela Lim',     'Habhab (Kabankalan)', '[{"name":"Bulalo Bowl","quantity":1,"price":11.5}]',                        11.50, 2.00, 13.50, 'pending',        'cash',    now() - interval '1 day', 'Unassigned'),
  ('ord_1006', '#KFD-1006', 'Paolo Gonzales', 'Koumi',               '[{"name":"Chicken Teriyaki","quantity":1,"price":9.0},{"name":"Garlic Rice","quantity":1,"price":2.0}]', 11.00, 1.80, 12.80, 'delivered', 'e_wallet', now() - interval '2 days', 'Carlo Bautista'),
  ('ord_1007', '#KFD-1007', 'Sofia Navarro',  'Habhab (Kabankalan)', '[{"name":"KBL (Kadios, Baboy, Langka)","quantity":3,"price":3.2},{"name":"Bagnet","quantity":1,"price":7.5}]', 17.10, 1.70, 18.80, 'cancelled', 'card', now() - interval '3 days', 'Unassigned'),
  ('ord_1008', '#KFD-1008', 'Mark Villanueva', 'Kalkan',             '[{"name":"Seafood Platter","quantity":2,"price":6.0},{"name":"Java Rice","quantity":1,"price":3.0}]', 15.00, 2.20, 17.20, 'out_for_delivery', 'cash', now() - interval '3 days', 'Nina Aquino');