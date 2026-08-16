grant usage on schema public to anon, authenticated;

grant select on table
  public.boats,
  public.tours,
  public.boat_tours,
  public.tour_packages,
  public.time_slots,
  public.reviews,
  public.gallery_images,
  public.destinations,
  public.payment_methods,
  public.editable_content,
  public.site_settings,
  public.extras,
  public.package_extras
to anon, authenticated;

grant select on table
  public.audit_log,
  public.availability_blocks,
  public.booking_extras,
  public.booking_notifications,
  public.booking_status_history,
  public.bookings,
  public.customers,
  public.media_assets,
  public.payment_webhook_events,
  public.payments,
  public.profiles,
  public.review_rate_limits
to authenticated;

grant insert, update, delete on table
  public.availability_blocks,
  public.boat_tours,
  public.boats,
  public.destinations,
  public.editable_content,
  public.extras,
  public.gallery_images,
  public.media_assets,
  public.package_extras,
  public.payment_methods,
  public.reviews,
  public.site_settings,
  public.time_slots,
  public.tour_packages,
  public.tours
to authenticated;

grant update on table public.bookings to authenticated;
grant delete on table public.bookings to authenticated;
grant insert, update, delete on table public.profiles to authenticated;
