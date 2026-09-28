const {authorized}=require("./admin-auth-lib");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth:{ persistSession:false, autoRefreshToken:false } }
);

function response(statusCode,data){
  return {
    statusCode,
    headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    body:JSON.stringify(data)
  };
}


function validDate(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
}

exports.handler=async function(event){
  if(!(await authorized(event))) return response(401,{success:false,error:"Contraseña incorrecta"});

  try{
    if(event.httpMethod==="GET"){
      const {data,error}=await supabase
        .from("finanzas_diarias")
        .select("id,fecha,ganancia,medias_docenas,creado_en,actualizado_en")
        .order("fecha",{ascending:false});
      if(error) throw error;
      const {data:metas,error:metasError}=await supabase
        .from("finanzas_metas")
        .select("id,anio,mes,gastos_fijos,creado_en,actualizado_en")
        .order("anio",{ascending:false})
        .order("mes",{ascending:false});
      if(metasError) throw metasError;
      const {data:gastos,error:gastosError}=await supabase
        .from("finanzas_gastos")
        .select("id,anio,mes,concepto,importe,creado_en,actualizado_en")
        .order("anio",{ascending:false})
        .order("mes",{ascending:false})
        .order("concepto",{ascending:true});
      if(gastosError) throw gastosError;
      return response(200,{success:true,registros:data||[],metas:metas||[],gastos:gastos||[]});
    }

    if(event.httpMethod!=="POST") return response(405,{success:false,error:"Método no permitido"});

    let body={};
    try{ body=JSON.parse(event.body||"{}"); }
    catch{ return response(400,{success:false,error:"Datos inválidos"}); }

    const action=String(body.action||"");

    if(action==="add-order-sale"){
      const fecha=String(body.fecha||"").trim();
      const ganancia=Number(body.ganancia);
      const pares=Number(body.pares);
      if(!validDate(fecha)) return response(400,{success:false,error:"Fecha inválida"});
      if(!Number.isFinite(ganancia)||ganancia<0) return response(400,{success:false,error:"Ganancia inválida"});
      if(!Number.isInteger(pares)||pares<0) return response(400,{success:false,error:"Pares inválidos"});
      const medias=pares/6;
      if(!Number.isInteger(medias)) return response(400,{success:false,error:"Los pares del pedido deben ser múltiplos de 6"});
      const {data:existing,error:ee}=await supabase.from("finanzas_diarias").select("id,fecha,ganancia,medias_docenas").eq("fecha",fecha).maybeSingle();
      if(ee)throw ee;
      const payload={fecha,ganancia:(Number(existing?.ganancia||0)+ganancia),medias_docenas:(Number(existing?.medias_docenas||0)+medias),actualizado_en:new Date().toISOString()};
      const query=existing?supabase.from("finanzas_diarias").update(payload).eq("id",existing.id):supabase.from("finanzas_diarias").insert(payload);
      const {data,error}=await query.select("id,fecha,ganancia,medias_docenas,creado_en,actualizado_en").single();
      if(error)throw error;
      return response(200,{success:true,registro:data});
    }

    if(action==="remove-order-sale"){
      const fecha=String(body.fecha||"").trim(),ganancia=Number(body.ganancia),pares=Number(body.pares);
      if(!validDate(fecha)||!Number.isFinite(ganancia)||ganancia<0||!Number.isInteger(pares)||pares<0) return response(400,{success:false,error:"Datos del pedido inválidos"});
      const {data:existing,error:ee}=await supabase.from("finanzas_diarias").select("id,ganancia,medias_docenas").eq("fecha",fecha).maybeSingle();
      if(ee)throw ee;
      if(!existing)return response(200,{success:true});
      const newProfit=Math.max(0,Number(existing.ganancia||0)-ganancia),newHalf=Math.max(0,Number(existing.medias_docenas||0)-(pares/6));
      const {error}=await supabase.from("finanzas_diarias").update({ganancia:newProfit,medias_docenas:newHalf,actualizado_en:new Date().toISOString()}).eq("id",existing.id);
      if(error)throw error;
      return response(200,{success:true});
    }

    if(action==="upsert"){
      const fecha=String(body.fecha||"").trim();
      const ganancia=Number(body.ganancia);
      const medias=Number(body.medias_docenas);
      if(!validDate(fecha)) return response(400,{success:false,error:"Fecha inválida"});
      if(!Number.isFinite(ganancia)||ganancia<0) return response(400,{success:false,error:"Ganancia inválida"});
      if(!Number.isInteger(medias)||medias<0) return response(400,{success:false,error:"Medias docenas inválidas"});

      const payload={fecha,ganancia,medias_docenas:medias,actualizado_en:new Date().toISOString()};
      const {data,error}=await supabase
        .from("finanzas_diarias")
        .upsert(payload,{onConflict:"fecha"})
        .select("id,fecha,ganancia,medias_docenas,creado_en,actualizado_en")
        .single();
      if(error) throw error;
      return response(200,{success:true,registro:data});
    }

    if(action==="update"){
      const id=Number(body.id);
      const fecha=String(body.fecha||"").trim();
      const ganancia=Number(body.ganancia);
      const medias=Number(body.medias_docenas);
      if(!Number.isInteger(id)||id<=0) return response(400,{success:false,error:"Registro inválido"});
      if(!validDate(fecha)) return response(400,{success:false,error:"Fecha inválida"});
      if(!Number.isFinite(ganancia)||ganancia<0) return response(400,{success:false,error:"Ganancia inválida"});
      if(!Number.isInteger(medias)||medias<0) return response(400,{success:false,error:"Medias docenas inválidas"});

      const {data,error}=await supabase
        .from("finanzas_diarias")
        .update({fecha,ganancia,medias_docenas:medias,actualizado_en:new Date().toISOString()})
        .eq("id",id)
        .select("id,fecha,ganancia,medias_docenas,creado_en,actualizado_en")
        .single();
      if(error) throw error;
      return response(200,{success:true,registro:data});
    }

    if(action==="save-goal"){
      const anio=Number(body.anio);
      const mes=Number(body.mes);
      const gastos=Number(body.gastos_fijos);
      if(!Number.isInteger(anio)||anio<2020||anio>2100) return response(400,{success:false,error:"Año inválido"});
      if(!Number.isInteger(mes)||mes<1||mes>12) return response(400,{success:false,error:"Mes inválido"});
      if(!Number.isFinite(gastos)||gastos<0) return response(400,{success:false,error:"Gastos fijos inválidos"});
      const {data,error}=await supabase
        .from("finanzas_metas")
        .upsert({anio,mes,gastos_fijos:gastos,actualizado_en:new Date().toISOString()},{onConflict:"anio,mes"})
        .select("id,anio,mes,gastos_fijos,creado_en,actualizado_en")
        .single();
      if(error) throw error;
      return response(200,{success:true,meta:data});
    }

    if(action==="save-expense"){
      const id=Number(body.id||0),anio=Number(body.anio),mes=Number(body.mes);
      const concepto=String(body.concepto||"").trim(),importe=Number(body.importe);
      if(!Number.isInteger(anio)||anio<2020||anio>2100) return response(400,{success:false,error:"Año inválido"});
      if(!Number.isInteger(mes)||mes<1||mes>12) return response(400,{success:false,error:"Mes inválido"});
      if(!concepto) return response(400,{success:false,error:"Concepto requerido"});
      if(!Number.isFinite(importe)||importe<0) return response(400,{success:false,error:"Importe inválido"});
      let query;
      if(id>0){
        query=supabase.from("finanzas_gastos").update({anio,mes,concepto,importe,actualizado_en:new Date().toISOString()}).eq("id",id);
      }else{
        query=supabase.from("finanzas_gastos").insert({anio,mes,concepto,importe,actualizado_en:new Date().toISOString()});
      }
      const {data,error}=await query.select("id,anio,mes,concepto,importe,creado_en,actualizado_en").single();
      if(error) throw error;
      return response(200,{success:true,gasto:data});
    }

    if(action==="delete-expense"){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<=0) return response(400,{success:false,error:"Gasto inválido"});
      const {data,error}=await supabase.from("finanzas_gastos").delete().eq("id",id).select("id").single();
      if(error) throw error;
      return response(200,{success:true,eliminado:data});
    }

    if(action==="import-sales"){
      const days=Array.isArray(body.days)?body.days:[];
      if(!days.length) return response(400,{success:false,error:"No hay días para importar"});
      let totalPairs=0,totalSales=0;
      for(const day of days){
        const fecha=String(day.fecha||"");
        const pares=Number(day.pares||0),venta=Number(day.venta||0);
        if(!validDate(fecha)||!Number.isInteger(pares)||pares<0||!Number.isFinite(venta)||venta<0) continue;
        const medias=Math.floor(pares/6);
        const clients=day.clientes&&typeof day.clientes==="object"?day.clientes:{};
        const {error}=await supabase.from("finanzas_ventas_importadas").upsert({
          fecha,pares,medias_docenas:medias,venta_total:venta,detalle_clientes:clients,actualizado_en:new Date().toISOString()
        },{onConflict:"fecha"});
        if(error) throw error;
        totalPairs+=pares;totalSales+=venta;
      }
      return response(200,{success:true,pares:totalPairs,venta:totalSales});
    }

    if(action==="delete"){
      const id=Number(body.id);
      if(!Number.isInteger(id)||id<=0) return response(400,{success:false,error:"Registro inválido"});
      const {data,error}=await supabase
        .from("finanzas_diarias")
        .delete()
        .eq("id",id)
        .select("id")
        .single();
      if(error) throw error;
      return response(200,{success:true,eliminado:data});
    }

    return response(400,{success:false,error:"Acción no reconocida"});
  }catch(error){
    console.error("ADMIN FINANZAS ERROR:",error);
    return response(500,{success:false,error:error.message||"Ocurrió un error administrando finanzas"});
  }
};