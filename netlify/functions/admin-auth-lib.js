const crypto=require("crypto");
const {createClient}=require("@supabase/supabase-js");
function client(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
function sha(v){return crypto.createHash("sha256").update(String(v||"")).digest("hex")}
async function authorized(event){
  // Acceso temporal abierto mientras se termina el administrador.
  // Todas las funciones internas que usan este helper quedan habilitadas
  // sin contraseña ni passkey. Restaurar autenticación antes de producción.
  return true;
}
module.exports={client,sha,authorized};
