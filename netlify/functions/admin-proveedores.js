const {authorized}=require("./admin-auth-lib");
const {createClient}=require("@supabase/supabase-js");
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const res=(s,d)=>({statusCode:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(d)});
const dateOk=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""));
exports.handler=async event=>{
 if(!(await authorized(event)))return res(401,{success:false,error:"No autorizado"});
 try{
  if(event.httpMethod==="GET"){
   const {data:proveedores,error:e1}=await supabase.from("proveedores").select("id,nombre,activo,creado_en").eq("activo",true).order("nombre");
   if(e1)throw e1;
   const {data:movimientos,error:e2}=await supabase.from("proveedores_movimientos").select("id,proveedor_id,tipo,fecha,folio,importe,pares,forma_pago,observaciones,creado_en,actualizado_en,eliminado_en").order("fecha",{ascending:false}).order("id",{ascending:false});
   if(e2)throw e2;return res(200,{success:true,proveedores:proveedores||[],movimientos:movimientos||[]});
  }
  if(event.httpMethod!=="POST")return res(405,{success:false,error:"Método no permitido"});
  const b=JSON.parse(event.body||"{}"),action=String(b.action||"");
  if(action==="add-provider"){
   const nombre=String(b.nombre||"").trim();if(!nombre)return res(400,{success:false,error:"Nombre requerido"});
   const {data,error}=await supabase.from("proveedores").insert({nombre}).select().single();if(error)throw error;return res(200,{success:true,proveedor:data});
  }
  if(action==="update-provider"){const id=Number(b.id),nombre=String(b.nombre||"").trim();if(!Number.isInteger(id)||id<1||!nombre)return res(400,{success:false,error:"Datos inválidos"});const {data,error}=await supabase.from("proveedores").update({nombre}).eq("id",id).eq("activo",true).select().single();if(error)throw error;return res(200,{success:true,registro:data});}
  if(action==="delete-provider"){const id=Number(b.id);if(!Number.isInteger(id)||id<1)return res(400,{success:false,error:"Proveedor inválido"});const {data,error}=await supabase.from("proveedores").update({activo:false}).eq("id",id).select().single();if(error)throw error;return res(200,{success:true,registro:data});}
  if(action==="add-movement"){
   const proveedor_id=Number(b.proveedor_id),tipo=String(b.tipo||""),fecha=String(b.fecha||""),importe=Number(b.importe),pares=b.pares==null?null:Number(b.pares);
   if(!Number.isInteger(proveedor_id)||proveedor_id<1)return res(400,{success:false,error:"Proveedor inválido"});
   if(!["nota","pago"].includes(tipo)||!dateOk(fecha)||!Number.isFinite(importe)||importe<=0)return res(400,{success:false,error:"Datos inválidos"});
   if(tipo==="nota"&&(!Number.isInteger(pares)||pares<=0))return res(400,{success:false,error:"Los pares son obligatorios en una nota"});
   const payload={proveedor_id,tipo,fecha,importe,folio:tipo==="nota"?String(b.folio||"").trim()||null:null,pares:tipo==="nota"?pares:null,forma_pago:tipo==="pago"?String(b.forma_pago||"").trim():null,observaciones:String(b.observaciones||"").trim()||null,actualizado_en:new Date().toISOString()};
   if(tipo==="pago"&&!payload.forma_pago)return res(400,{success:false,error:"Forma de pago requerida"});
   const {data,error}=await supabase.from("proveedores_movimientos").insert(payload).select().single();if(error)throw error;return res(200,{success:true,movimiento:data});
  }
  if(action==="complete-movement"){
   const id=Number(b.id);
   if(!Number.isInteger(id)||id<1)return res(400,{success:false,error:"Movimiento inválido"});
   const {data:current,error:ce}=await supabase.from("proveedores_movimientos").select("id,tipo,fecha,folio,pares,forma_pago").eq("id",id).single();if(ce)throw ce;
   const patch={actualizado_en:new Date().toISOString()};
   if(!current.fecha){if(!dateOk(b.fecha))return res(400,{success:false,error:"Falta una fecha válida"});patch.fecha=b.fecha}
   if(current.tipo==="nota"){
    if(!current.folio){const folio=String(b.folio||"").trim();if(!folio)return res(400,{success:false,error:"Falta el folio"});patch.folio=folio}
    if(!current.pares){const pares=Number(b.pares);if(!Number.isInteger(pares)||pares<=0)return res(400,{success:false,error:"Faltan los pares"});patch.pares=pares}
   }
   if(current.tipo==="pago"&&!current.forma_pago){const forma=String(b.forma_pago||"").trim();if(!forma)return res(400,{success:false,error:"Falta la forma de pago"});patch.forma_pago=forma}
   const {data,error}=await supabase.from("proveedores_movimientos").update(patch).eq("id",id).select().single();if(error)throw error;return res(200,{success:true,movimiento:data});
  }
  if(action==="update-movement"){
   const id=Number(b.id),tipo=String(b.tipo||""),fecha=String(b.fecha||""),importe=Number(b.importe);
   if(!Number.isInteger(id)||id<1||!["nota","pago"].includes(tipo)||!dateOk(fecha)||!Number.isFinite(importe)||importe<=0)return res(400,{success:false,error:"Datos inválidos"});
   const patch={fecha,importe,actualizado_en:new Date().toISOString()};
   if(tipo==="nota"){const folio=String(b.folio||"").trim(),pares=Number(b.pares);if(!folio||!Number.isInteger(pares)||pares<=0)return res(400,{success:false,error:"Fecha, folio, importe y pares son obligatorios"});patch.folio=folio;patch.pares=pares}
   else{const forma=String(b.forma_pago||"").trim();if(!forma)return res(400,{success:false,error:"Fecha, importe y forma de pago son obligatorios"});patch.forma_pago=forma}
   const {data,error}=await supabase.from("proveedores_movimientos").update(patch).eq("id",id).is("eliminado_en",null).select().single();if(error)throw error;return res(200,{success:true,movimiento:data});
  }
  if(action==="delete-movement"){const id=Number(b.id);const {data,error}=await supabase.from("proveedores_movimientos").update({eliminado_en:new Date().toISOString(),actualizado_en:new Date().toISOString()}).eq("id",id).is("eliminado_en",null).select().single();if(error)throw error;return res(200,{success:true,eliminado:data})}
  if(action==="restore-movement"){const id=Number(b.id);const {data,error}=await supabase.from("proveedores_movimientos").update({eliminado_en:null,actualizado_en:new Date().toISOString()}).eq("id",id).select().single();if(error)throw error;return res(200,{success:true,movimiento:data})}
  return res(400,{success:false,error:"Acción no reconocida"});
 }catch(e){console.error(e);return res(500,{success:false,error:e.message||"Error de proveedores"})}
};