create extension if not exists citext;
create extension if not exists pgcrypto;

create table if not exists public.admin_members (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active', 'disabled')),
  is_owner boolean not null default false,
  invited_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderator_permissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.admin_members(id) on delete cascade,
  permission text not null check (permission in ('resources_subject', 'blog', 'guide')),
  subject text,
  created_at timestamptz not null default now(),
  constraint moderator_permissions_subject_check check (
    (permission = 'resources_subject' and subject in ('Astronomy', 'Biology', 'Chemistry', 'Mathematics', 'Physics'))
    or (permission in ('blog', 'guide') and subject is null)
  )
);

create unique index if not exists moderator_permissions_unique
on public.moderator_permissions (member_id, permission, coalesce(subject, ''));

alter table public.content_items add column if not exists deleted_at timestamptz;
alter table public.content_items add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.resources add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.resources add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.resources add column if not exists deleted_at timestamptz;
alter table public.resources add column if not exists deleted_by uuid references auth.users(id) on delete set null;

drop trigger if exists admin_members_set_updated_at on public.admin_members;
create trigger admin_members_set_updated_at before update on public.admin_members
for each row execute function public.set_updated_at();

insert into public.admin_members (email, user_id, display_name, status, is_owner, invited_by)
select
  coalesce(nullif(p.email, ''), u.email)::citext as email,
  ar.user_id,
  coalesce(nullif(p.display_name, ''), u.email, '') as display_name,
  case when ar.role = 'owner' then 'active' else 'disabled' end as status,
  ar.role = 'owner' as is_owner,
  ar.invited_by
from public.admin_roles ar
left join public.profiles p on p.id = ar.user_id
left join auth.users u on u.id = ar.user_id
where coalesce(nullif(p.email, ''), u.email) is not null
on conflict (email) do update
set user_id = coalesce(public.admin_members.user_id, excluded.user_id),
    display_name = coalesce(nullif(public.admin_members.display_name, ''), excluded.display_name),
    is_owner = public.admin_members.is_owner or excluded.is_owner,
    status = case when public.admin_members.is_owner or excluded.is_owner then 'active' else public.admin_members.status end,
    invited_by = coalesce(public.admin_members.invited_by, excluded.invited_by);

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_members
    where user_id = check_user
      and status = 'active'
  );
$$;

create or replace function public.is_owner(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_members
    where user_id = check_user
      and status = 'active'
      and is_owner = true
  );
$$;

create or replace function public.admin_member_id(check_user uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.admin_members
  where user_id = check_user
    and status = 'active'
  limit 1;
$$;

create or replace function public.has_moderator_permission(check_permission text, check_subject text default null, check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner(check_user) or exists (
    select 1
    from public.admin_members am
    join public.moderator_permissions mp on mp.member_id = am.id
    where am.user_id = check_user
      and am.status = 'active'
      and mp.permission = check_permission
      and (
        (check_permission = 'resources_subject' and mp.subject = check_subject)
        or (check_permission in ('blog', 'guide') and mp.subject is null)
      )
  );
$$;

create or replace function public.has_admin_role(allowed public.admin_role_name[], check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner(check_user);
$$;

alter table public.admin_members enable row level security;
alter table public.moderator_permissions enable row level security;

drop policy if exists "Members read own admin member row" on public.admin_members;
create policy "Members read own admin member row" on public.admin_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner(auth.uid()));

drop policy if exists "Owners manage admin members" on public.admin_members;
create policy "Owners manage admin members" on public.admin_members
  for all to authenticated
  using (public.is_owner(auth.uid()))
  with check (public.is_owner(auth.uid()));

drop policy if exists "Members read own moderator permissions" on public.moderator_permissions;
create policy "Members read own moderator permissions" on public.moderator_permissions
  for select to authenticated
  using (
    public.is_owner(auth.uid())
    or member_id = public.admin_member_id(auth.uid())
  );

drop policy if exists "Owners manage moderator permissions" on public.moderator_permissions;
create policy "Owners manage moderator permissions" on public.moderator_permissions
  for all to authenticated
  using (public.is_owner(auth.uid()))
  with check (public.is_owner(auth.uid()));

drop policy if exists "Published content is public" on public.content_items;
create policy "Published content is public" on public.content_items
  for select using (status = 'published' and published_at <= now() and deleted_at is null);

drop policy if exists "Admins can read all content" on public.content_items;
drop policy if exists "Contributors can create drafts" on public.content_items;
drop policy if exists "Editors can update content" on public.content_items;
drop policy if exists "Owners and editors delete content" on public.content_items;
drop policy if exists "Admins read scoped content" on public.content_items;
drop policy if exists "Admins create scoped content" on public.content_items;
drop policy if exists "Admins update scoped content" on public.content_items;
drop policy if exists "Owners delete content" on public.content_items;

create policy "Admins read scoped content" on public.content_items
  for select to authenticated
  using (
    public.is_owner(auth.uid())
    or (
      kind = 'blog_post'
      and created_by = auth.uid()
      and public.has_moderator_permission('blog', null, auth.uid())
    )
    or (
      kind = 'guide'
      and created_by = auth.uid()
      and public.has_moderator_permission('guide', null, auth.uid())
    )
  );

create policy "Admins create scoped content" on public.content_items
  for insert to authenticated
  with check (
    public.is_owner(auth.uid())
    or (
      kind = 'blog_post'
      and created_by = auth.uid()
      and public.has_moderator_permission('blog', null, auth.uid())
    )
    or (
      kind = 'guide'
      and created_by = auth.uid()
      and public.has_moderator_permission('guide', null, auth.uid())
    )
  );

create policy "Admins update scoped content" on public.content_items
  for update to authenticated
  using (
    public.is_owner(auth.uid())
    or (
      kind = 'blog_post'
      and created_by = auth.uid()
      and public.has_moderator_permission('blog', null, auth.uid())
    )
    or (
      kind = 'guide'
      and created_by = auth.uid()
      and public.has_moderator_permission('guide', null, auth.uid())
    )
  )
  with check (
    public.is_owner(auth.uid())
    or (
      kind = 'blog_post'
      and created_by = auth.uid()
      and public.has_moderator_permission('blog', null, auth.uid())
    )
    or (
      kind = 'guide'
      and created_by = auth.uid()
      and public.has_moderator_permission('guide', null, auth.uid())
    )
  );

create policy "Owners delete content" on public.content_items
  for delete to authenticated
  using (public.is_owner(auth.uid()));

drop policy if exists "Published resources are public" on public.resources;
create policy "Published resources are public" on public.resources
  for select using (status = 'published' and deleted_at is null);

drop policy if exists "Admins manage resources" on public.resources;
drop policy if exists "Admins read scoped resources" on public.resources;
drop policy if exists "Admins create scoped resources" on public.resources;
drop policy if exists "Admins update scoped resources" on public.resources;
drop policy if exists "Owners delete resources" on public.resources;
create policy "Admins read scoped resources" on public.resources
  for select to authenticated
  using (public.is_owner(auth.uid()) or public.has_moderator_permission('resources_subject', subject, auth.uid()));

create policy "Admins create scoped resources" on public.resources
  for insert to authenticated
  with check (public.is_owner(auth.uid()) or public.has_moderator_permission('resources_subject', subject, auth.uid()));

create policy "Admins update scoped resources" on public.resources
  for update to authenticated
  using (public.is_owner(auth.uid()) or public.has_moderator_permission('resources_subject', subject, auth.uid()))
  with check (public.is_owner(auth.uid()) or public.has_moderator_permission('resources_subject', subject, auth.uid()));

create policy "Owners delete resources" on public.resources
  for delete to authenticated
  using (public.is_owner(auth.uid()));
