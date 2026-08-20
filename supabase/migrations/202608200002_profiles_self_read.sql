drop policy if exists "authenticated read own profile" on public.profiles;
create policy "authenticated read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());
