const crypto=require("crypto");
const {createClient}=require("@supabase/supabase-js");
function client(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
function sha(v){return crypto.createHash("sha256").update(String(v||"")).digest("hex")}
async function authorized(event){
  // Acceso temporal abierto mientras se termina el administrador.
  // Mantener consistente con main para que las funciones del subdominio
  // no rechacen pedidos con "Contraseña incorrecta" mientras el login está desactivado.
  return true;
}
module.exports={client,sha,authorized};
