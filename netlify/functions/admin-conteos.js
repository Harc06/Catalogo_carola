const {authorized}=require("./admin-auth-lib");
const {createClient}=require("@supabase/supabase-js");

const headers={
  "Content-Type":"application/json",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"Content-Type, x-admin-password, Authorization",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS"
};
const respond=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});

function db(){
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
}

async function getCount(supabase,id){
  const {data:count,error}=await supabase.from("conteos_inventario").select("*").eq("id",id).single();
  if(error) throw new Error(error.message);
  const {data:rows,error:itemsError}=await supabase
    .from("conteos_inventario_items")
    .select("id,conteo_id,variante_id,existencia_anterior,cantidad_contada,estado,orden,actualizado_en,variantes(id,color,modelo_id,modelos(id,modelo,categoria),proveedores(id,nombre),imagenes(id,url,orden))")
    .eq("conteo_id",id).order("orden",{ascending:true});
  if(itemsError) throw new Error(itemsError.message);
  const items=(rows||[]).map(row=>{
    const v=row.variantes||{};
    const images=Array.isArray(v.imagenes)?v.imagenes.slice().sort((a,b)=>Number(a.orden||0)-Number(b.orden||0)):[];
    return {
      id:row.id,variante_id:row.variante_id,existencia_anterior:row.existencia_anterior,
      cantidad_contada:row.cantidad_contada,estado:row.estado,orden:row.orden,
      modelo:v.modelos?.modelo||"",categoria:v.modelos?.categoria||"",color:v.color||"",
      proveedor:v.proveedores?.nombre||"",imagen:images[0]?.url||""
    };
  });
  return {conteo:count,items};
}

exports.handler=async event=>{
  if(event.httpMethod==="OPTIONS") return respond(200,{});
  if(!(await authorized(event))) return respond(401,{success:false,error:"Acceso no autorizado"});
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY) return respond(500,{success:false,error:"Faltan variables de Supabase."});
  const supabase=db();

  try{
    if(event.httpMethod==="GET"){
      const id=Number(event.queryStringParameters?.id||0);
      if(id){
        const detail=await getCount(supabase,id);
        return respond(200,{success:true,...detail});
      }
      const {data,error}=await supabase.from("conteos_inventario").select("*").order("creado_en",{ascending:false}).limit(30);
      if(error) throw new Error(error.message);
      return respond(200,{success:true,conteos:data||[]});
    }
    if(event.httpMethod!=="POST") return respond(405,{success:false,error:"Método no permitido"});

    const body=JSON.parse(event.body||"{}");
    const action=String(body.action||"");

    if(action==="start"){
      const tipo=String(body.tipo||"general");
      const filtro=body.filtro==null?null:String(body.filtro);
      if(!["general","categoria","proveedor"].includes(tipo)) throw new Error("Tipo de conteo inválido.");
      if(tipo!=="general"&&!filtro) throw new Error("Selecciona el filtro del conteo.");

      let query=supabase.from("variantes")
        .select("id,color,proveedor_id,modelos!inner(id,modelo,categoria,activo)")
        .eq("activo",true).eq("modelos.activo",true);
      if(tipo==="categoria") query=query.eq("modelos.categoria",filtro);
      if(tipo==="proveedor") query=query.eq("proveedor_id",Number(filtro));
      const {data:variants,error:vError}=await query;
      if(vError) throw new Error(vError.message);
      if(!(variants||[]).length) throw new Error("No hay modelos para ese conteo.");

      const ids=variants.map(v=>Number(v.id));
      const {data:stocks,error:sError}=await supabase.from("inventario_mayoreo").select("variante_id,existencia").in("variante_id",ids);
      if(sError) throw new Error(sError.message);
      const stockMap=new Map((stocks||[]).map(s=>[Number(s.variante_id),Number(s.existencia||0)]));
      const ordered=variants.slice().sort((a,b)=>{
        const am=String(a.modelos?.modelo||""),bm=String(b.modelos?.modelo||"");
        const mc=am.localeCompare(bm,undefined,{numeric:true,sensitivity:"base"});
        return mc||String(a.color||"").localeCompare(String(b.color||""),"es",{sensitivity:"base"});
      });

      const {data:count,error:cError}=await supabase.from("conteos_inventario").insert({
        tipo,filtro,total_items:ordered.length,estado:"en_progreso"
      }).select("*").single();
      if(cError) throw new Error(cError.message);

      const payload=ordered.map((v,index)=>({
        conteo_id:count.id,variante_id:v.id,existencia_anterior:stockMap.get(Number(v.id))||0,
        estado:"pendiente",orden:index
      }));
      const {error:iError}=await supabase.from("conteos_inventario_items").insert(payload);
      if(iError){
        await supabase.from("conteos_inventario").delete().eq("id",count.id);
        throw new Error(iError.message);
      }
      const detail=await getCount(supabase,count.id);
      return respond(200,{success:true,...detail});
    }

    if(action==="save-item"){
      const conteoId=Number(body.conteo_id),itemId=Number(body.item_id);
      const estado=String(body.estado||"");
      if(!conteoId||!itemId||!["confirmado","revisar"].includes(estado)) throw new Error("Movimiento inválido.");
      const cantidad=estado==="confirmado"?Number(body.cantidad):null;
      if(estado==="confirmado"&&(!Number.isInteger(cantidad)||cantidad<0)) throw new Error("La cantidad debe ser un número entero de pares.");

      const {error}=await supabase.from("conteos_inventario_items").update({
        estado,cantidad_contada:cantidad,actualizado_en:new Date().toISOString()
      }).eq("id",itemId).eq("conteo_id",conteoId);
      if(error) throw new Error(error.message);

      const {data:all,error:listError}=await supabase.from("conteos_inventario_items").select("estado").eq("conteo_id",conteoId);
      if(listError) throw new Error(listError.message);
      const confirmados=(all||[]).filter(x=>x.estado==="confirmado").length;
      const revisar=(all||[]).filter(x=>x.estado==="revisar").length;
      await supabase.from("conteos_inventario").update({confirmados,revisar}).eq("id",conteoId);
      return respond(200,{success:true,confirmados,revisar});
    }

    if(action==="finalize"){
      const conteoId=Number(body.conteo_id);
      if(!conteoId) throw new Error("Conteo inválido.");
      const {data:items,error}=await supabase.from("conteos_inventario_items")
        .select("id,variante_id,existencia_anterior,cantidad_contada,estado").eq("conteo_id",conteoId);
      if(error) throw new Error(error.message);
      const unresolved=(items||[]).filter(x=>x.estado!=="confirmado");
      if(unresolved.length) throw new Error("Todavía hay "+unresolved.length+" colores por revisar.");

      for(const item of items||[]){
        const {error:stockError}=await supabase.from("inventario_mayoreo").upsert({
          variante_id:item.variante_id,existencia:Number(item.cantidad_contada||0),actualizado_en:new Date().toISOString()
        },{onConflict:"variante_id"});
        if(stockError) throw new Error(stockError.message);
      }
      const {data:count,error:cError}=await supabase.from("conteos_inventario").update({
        estado:"finalizado",confirmados:(items||[]).length,revisar:0,finalizado_en:new Date().toISOString()
      }).eq("id",conteoId).select("*").single();
      if(cError) throw new Error(cError.message);

      const diferencias=(items||[]).filter(x=>Number(x.cantidad_contada)!==Number(x.existencia_anterior)).map(x=>({
        variante_id:x.variante_id,anterior:Number(x.existencia_anterior),contado:Number(x.cantidad_contada),
        diferencia:Number(x.cantidad_contada)-Number(x.existencia_anterior)
      }));
      return respond(200,{success:true,conteo:count,diferencias});
    }

    throw new Error("Acción no reconocida.");
  }catch(error){
    console.error("ADMIN CONTEOS:",error);
    return respond(400,{success:false,error:error.message||"No se pudo procesar el conteo."});
  }
};