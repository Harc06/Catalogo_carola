exports.handler=async function(event){
 const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
 const reply=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
 try{
  if(event.httpMethod!=="POST")return reply(405,{success:false});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)return reply(500,{success:false});
  const body=JSON.parse(event.body||"{}"),allowed=new Set(["visita","modelo","agregar","carrito","whatsapp","busqueda"]),evento=String(body.evento||"").toLowerCase();
  if(!allowed.has(evento))return reply(400,{success:false});
  const clean=(v,n)=>String(v||"").trim().slice(0,n);
  const row={evento,visitante_id:clean(body.visitante_id,80),sesion_id:clean(body.sesion_id,80),modelo:clean(body.modelo,120)||null,color:clean(body.color,80)||null,cantidad:Number.isFinite(Number(body.cantidad))?Math.max(0,Math.round(Number(body.cantidad))):null,pagina:clean(body.pagina,160)||null};
  if(!row.visitante_id||!row.sesion_id)return reply(400,{success:false});
  const r=await fetch(url+"/rest/v1/catalogo_eventos",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify(row)});if(!r.ok)throw new Error(await r.text());
  return reply(200,{success:true});
 }catch(e){return reply(500,{success:false})}
};