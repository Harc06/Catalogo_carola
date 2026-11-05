const crypto=require("crypto");
const {createClient}=require("@supabase/supabase-js");
function client(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
function sha(v){return crypto.createHash("sha256").update(String(v||"")).digest("hex")}
function safeEqual(a,b){
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length&&crypto.timingSafeEqual(x,y);
}

// Acepta tres formas de acceso (fail-closed si no hay ninguna válida):
// 1. Cabecera x-admin-password igual a ADMIN_PASSWORD (la usa catalogo-mayoreo.html).
// 2. Bearer de una sesión de passkey vigente (tabla admin_sessions, creada por admin-auth.js).
// 3. Bearer de un usuario válido de Supabase Auth (mismo criterio que Carola_admin).
async function authorized(event){
  try{
    const headers=event?.headers||{};
    const password=process.env.ADMIN_PASSWORD;
    const provided=headers["x-admin-password"]||headers["X-Admin-Password"]||"";
    if(password&&provided&&safeEqual(provided,password))return true;

    const match=String(headers.authorization||headers.Authorization||"").match(/^Bearer\s+(.+)$/i);
    if(!match)return false;
    const token=match[1];
    const db=client();

    const {data:session}=await db.from("admin_sessions").select("token_hash").eq("token_hash",sha(token)).gt("expires_at",new Date().toISOString()).maybeSingle();
    if(session)return true;

    const {data,error}=await db.auth.getUser(token);
    return !error&&!!data?.user;
  }catch(e){
    console.error("Admin auth error",e);
    return false;
  }
}
module.exports={client,sha,authorized};
