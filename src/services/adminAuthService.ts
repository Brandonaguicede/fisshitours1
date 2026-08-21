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

export async function signInAdmin(email: string, password: string): Promise<AdminProfile> {
  if (!isSupabaseConfigured) {
    throw new Error('El panel administrativo no esta configurado para iniciar sesion en este entorno.');
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Credenciales incorrectas o usuario no autorizado.');

  const profile = await getCurrentAdminProfile();
  if (!profile) throw new Error('No se pudo iniciar sesion.');
  return profile;
}

export async function signOutAdmin() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}
