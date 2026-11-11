import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, corsPreflight, withCors } from '../_shared/cors.ts';
import { handleBacCertification } from '../_shared/bac-certification.ts';

serve(withCors(async req => {
  const headers=corsHeaders(req,'POST, OPTIONS');
  if(req.method==='OPTIONS') return corsPreflight(req,'POST, OPTIONS');
  if(req.method!=='POST') return Response.json({message:'Method not allowed'},{status:405,headers});
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token) return Response.json({message:'Admin session required'},{status:401,headers});
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key) return Response.json({message:'Service unavailable'},{status:503,headers});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:user,error}=await db.auth.getUser(token);
  if(error||!user.user) return Response.json({message:'Invalid admin session'},{status:401,headers});
  const {data:profile,error:profileError}=await db.from('profiles').select('role,active').eq('id',user.user.id).maybeSingle();
  if(profileError||!profile?.active||profile.role!=='admin') return Response.json({message:'Admin role required'},{status:403,headers});
  try {
    return await handleBacCertification(await req.json(),user.user.id,db,Deno.env.get('BAC_CERTIFICATION_ENABLED')==='true',headers);
  } catch {
    return Response.json({message:'No se pudo confirmar el resultado. Actualiza el historial antes de intentar otra operación.'},{status:500,headers});
  }
}));
