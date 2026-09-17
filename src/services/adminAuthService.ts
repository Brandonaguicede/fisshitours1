import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type AdminRole = 'admin' | 'editor' | 'viewer';

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  active: boolean;
}

const ALLOWED_ROLES: AdminRole[] = ['admin', 'editor', 'viewer'];

export function isAllowedAdminRole(role: string | null | undefined): role is AdminRole {
  return ALLOWED_ROLES.includes(role as AdminRole);
}

export async function getCurrentAdminProfile(): Promise<AdminProfile | null> {
  if (!isSupabaseConfigured) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error('No se pudo validar la sesion.');
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new Error('No se pudo validar el perfil administrativo.');
  if (!profile || !profile.active || !isAllowedAdminRole(profile.role)) {
    await supabase.auth.signOut();
    throw new Error('Tu usuario no tiene acceso activo al panel administrativo.');
  }

  return profile as AdminProfile;
}

export async function signInAdmin(email: string, password: string, captchaToken?: string): Promise<AdminProfile> {
  if (!isSupabaseConfigured) {
    throw new Error('El panel administrativo no esta configurado para iniciar sesion en este entorno.');
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) throw new Error('Correo o contraseña incorrectos.');

  const profile = await getCurrentAdminProfile();
  if (!profile) throw new Error('No se pudo iniciar sesion.');
  return profile;
}

export async function signOutAdmin() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

export async function readWithAdminSession<T>(
  query: () => PromiseLike<{ data: T | null; error: { message: string } | null; status: number }>,
): Promise<T | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('Tu sesion expiro. Inicia sesion nuevamente para ver las reservas.');
  }

  let result = await query();
  if (result.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      throw new Error('Tu sesion expiro. Inicia sesion nuevamente para ver las reservas.');
    }
    result = await query();
  }
  if (result.status === 401) {
    throw new Error('Tu sesion expiro. Inicia sesion nuevamente para ver las reservas.');
  }
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
