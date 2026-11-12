-- DailyFlow Finance schema. Run in Supabase SQL editor.
create table accounts(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, type text not null check (type in ('cash','bank','wallet')), opening_balance numeric(14,2) not null default 0, created_at timestamptz default now());
create table categories(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references categories on delete cascade, name text not null, kind text not null check (kind in ('income','expense')),
  color text default '#64748b', icon text default '🏷️', created_at timestamptz default now());
create table transactions(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('income','expense','transfer')), account_id uuid not null references accounts on delete cascade,
  to_account_id uuid references accounts on delete cascade, category_id uuid references categories on delete set null,
  amount numeric(14,2) not null check (amount > 0), tx_date date not null, description text, notes text, recurring_id uuid,
  created_at timestamptz default now(),
  check ((kind = 'transfer') = (to_account_id is not null)), check (to_account_id is null or to_account_id <> account_id),
  unique (recurring_id, tx_date)); -- stops double-generation of recurring rows
create index on transactions (user_id, tx_date);
create table recurring_rules(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template jsonb not null, frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  next_date date not null, end_date date, active boolean not null default true);
create table budgets(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid references categories on delete cascade, period text not null check (period in ('daily','monthly','yearly')), amount numeric(14,2) not null check (amount > 0));
create table goals(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, target_amount numeric(14,2) not null check (target_amount > 0), saved_amount numeric(14,2) not null default 0, deadline date);
create table settings(user_id uuid primary key default auth.uid() references auth.users on delete cascade, currency text not null default 'USD');

-- Balance = opening + income - expense + transfers in - transfers out
create view account_balances with (security_invoker = true) as
select a.id, a.name, a.type, a.opening_balance + coalesce(sum(case
  when t.account_id = a.id and t.kind = 'income' then t.amount
  when t.account_id = a.id and t.kind in ('expense','transfer') then -t.amount
  when t.to_account_id = a.id then t.amount end), 0) as balance
from accounts a left join transactions t on a.id in (t.account_id, t.to_account_id) group by a.id;

-- Row-level security: every user sees only their own rows
do $$ declare t text; begin
  foreach t in array array['accounts','categories','transactions','recurring_rules','budgets','goals'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
  alter table settings enable row level security;
  create policy own on settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
end $$;
