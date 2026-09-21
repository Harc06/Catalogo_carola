const crypto=require("crypto");
const {createClient}=require("@supabase/supabase-js");
function client(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
function sha(v){return crypto.createHash("sha256").update(String(v||"")).digest("hex")}
async function authorized(event){
  const legacy=event.headers["x-admin-password"]||event.headers["X-Admin-Password"];
  if(process.env.ADMIN_PASSWORD&&legacy===process.env.ADMIN_PASSWORD)return true;
  const h=event.headers["authorization"]||event.headers["Authorization"]||"";
  const token=h.startsWith("Bearer ")?h.slice(7).trim():"";
  if(!token)return false;
  const {data,error}=await client().from("admin_sessions").select("expires_at").eq("token_hash",sha(token)).maybeSingle();
  return !error&&data&&new Date(data.expires_at)>new Date();
}
module.exports={client,sha,authorized};
