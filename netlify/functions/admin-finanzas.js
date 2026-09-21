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

function authorized(event){
  const password=event.headers["x-admin-password"]||event.headers["X-Admin-Password"];
  return Boolean(process.env.ADMIN_PASSWORD && password===process.env.ADMIN_PASSWORD);
}

function validDate(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
}

exports.handler=async function(event){
  if(!authorized(event)) return response(401,{success:false,error:"Contraseña incorrecta"});

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
      return response(200,{success:true,registros:data||[],metas:metas||[]});
    }

    if(event.httpMethod!=="POST") return response(405,{success:false,error:"Método no permitido"});

    let body={};
    try{ body=JSON.parse(event.body||"{}"); }
    catch{ return response(400,{success:false,error:"Datos inválidos"}); }

    const action=String(body.action||"");

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