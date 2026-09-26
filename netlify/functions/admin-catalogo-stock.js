const {authorized}=require("./admin-auth-lib");
const {createClient}=require("@supabase/supabase-js");
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const res=(s,d)=>({statusCode:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(d)});
exports.handler=async event=>{
 if(!(await authorized(event)))return res(401,{success:false,error:"No autorizado"});
 try{
  if(event.httpMethod==="GET"){
   const [{data:modelos,error:e1},{data:variantes,error:e2},{data:inventario,error:e3},{data:categorias,error:e4}]=await Promise.all([
    supabase.from("modelos").select("id,modelo,categoria,activo").eq("activo",true).order("modelo"),
    supabase.from("variantes").select("id,modelo_id,color,activo").eq("activo",true).order("id"),
    supabase.from("inventario_mayoreo").select("id,variante_id,existencia,actualizado_en"),
    supabase.from("catalogo_categorias").select("id,nombre,orden").eq("activo",true).order("orden")
   ]);
   if(e1||e2||e3||e4)throw(e1||e2||e3||e4);
   return res(200,{success:true,modelos:modelos||[],variantes:variantes||[],inventario:inventario||[],categorias:categorias||[]});
  }
  if(event.httpMethod!=="POST")return res(405,{success:false,error:"Método no permitido"});
  const b=JSON.parse(event.body||"{}");
  if(b.action==="save-stock"){
   const variante_id=Number(b.variante_id),existencia=Number(b.existencia);
   if(!Number.isInteger(variante_id)||variante_id<1||!Number.isInteger(existencia)||existencia<0)return res(400,{success:false,error:"Existencia inválida"});
   const {data,error}=await supabase.from("inventario_mayoreo").upsert({variante_id,existencia,actualizado_en:new Date().toISOString()},{onConflict:"variante_id"}).select().single();
   if(error)throw error;return res(200,{success:true,registro:data});
  }
  if(b.action==="save-category"){
   const modelo_id=Number(b.modelo_id),categoria=String(b.categoria||"").trim();
   if(!Number.isInteger(modelo_id)||modelo_id<1||!categoria)return res(400,{success:false,error:"Categoría inválida"});
   const {data:cat,error:ce}=await supabase.from("catalogo_categorias").select("nombre").eq("nombre",categoria).eq("activo",true).maybeSingle();if(ce)throw ce;if(!cat)return res(400,{success:false,error:"Categoría no permitida"});
   const {data,error}=await supabase.from("modelos").update({categoria}).eq("id",modelo_id).select().single();if(error)throw error;return res(200,{success:true,modelo:data});
  }
  return res(400,{success:false,error:"Acción no reconocida"});
 }catch(e){console.error(e);return res(500,{success:false,error:e.message||"Error de catálogo"})}
};