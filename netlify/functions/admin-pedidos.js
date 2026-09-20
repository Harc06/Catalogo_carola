const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession:false, autoRefreshToken:false } }
);

const ESTADOS_VALIDOS=["Nuevo","Confirmado","Surtido","Enviado","Cancelado"];

function response(statusCode,data){
  return {
    statusCode,
    headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
    body:JSON.stringify(data)
  };
}

function authorized(event){
  const password=event.headers["x-admin-password"]||event.headers["X-Admin-Password"];
  return process.env.ADMIN_PASSWORD && password===process.env.ADMIN_PASSWORD;
}

function cleanText(value,max=120){
  return String(value||"").trim().replace(/\s+/g," ").slice(0,max);
}

exports.handler=async function(event){
  if(!authorized(event)){
    return response(401,{success:false,error:"Contraseña incorrecta"});
  }

  try{
    if(event.httpMethod==="GET"){
      const {data:pedidos,error}=await supabase
        .from("pedidos")
        .select(`
          id, folio, cliente, total_pares, estado, creado_en, actualizado_en,
          nota_cliente, nota_fecha, nota_total, nota_guardada, nota_actualizada_en,
          pedido_detalles (
            id, modelo, color, cantidad, precio_unitario, importe
          )
        `)
        .order("creado_en",{ascending:false});

      if(error) throw error;
      return response(200,{success:true,count:pedidos.length,pedidos});
    }

    if(event.httpMethod!=="POST"){
      return response(405,{success:false,error:"Método no permitido"});
    }

    let body;
    try{ body=JSON.parse(event.body||"{}"); }
    catch{ return response(400,{success:false,error:"Datos inválidos"}); }

    const action=String(body.action||"");
    const pedidoId=Number(body.pedido_id);

    if(!Number.isInteger(pedidoId)||pedidoId<=0){
      return response(400,{success:false,error:"Pedido inválido"});
    }

    if(action==="save-note"){
      const cliente=cleanText(body.cliente,120);
      const fecha=String(body.fecha||"").trim();
      const items=Array.isArray(body.items)?body.items:[];

      if(!cliente) return response(400,{success:false,error:"Falta el nombre del cliente"});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return response(400,{success:false,error:"Fecha inválida"});
      if(!items.length) return response(400,{success:false,error:"La nota no tiene productos"});

      let total=0;
      const updates=[];

      for(const item of items){
        const detailId=Number(item.id);
        const cantidad=Number(item.cantidad);
        const precio=Number(item.precio_unitario);

        if(!Number.isInteger(detailId)||detailId<=0||!Number.isFinite(cantidad)||cantidad<=0||!Number.isFinite(precio)||precio<0){
          return response(400,{success:false,error:"Hay precios o productos inválidos"});
        }

        const importe=Math.round((cantidad*precio+Number.EPSILON)*100)/100;
        total+=importe;
        updates.push({id:detailId,precio_unitario:precio,importe});
      }

      total=Math.round((total+Number.EPSILON)*100)/100;

      for(const item of updates){
        const {error}=await supabase
          .from("pedido_detalles")
          .update({precio_unitario:item.precio_unitario,importe:item.importe})
          .eq("id",item.id)
          .eq("pedido_id",pedidoId);
        if(error) throw error;
      }

      const {data,error}=await supabase
        .from("pedidos")
        .update({
          nota_cliente:cliente,
          nota_fecha:fecha,
          nota_total:total,
          nota_guardada:true,
          nota_actualizada_en:new Date().toISOString(),
          estado:"Confirmado"
        })
        .eq("id",pedidoId)
        .select(`
          id, folio, cliente, total_pares, estado, creado_en, actualizado_en,
          nota_cliente, nota_fecha, nota_total, nota_guardada, nota_actualizada_en,
          pedido_detalles (
            id, modelo, color, cantidad, precio_unitario, importe
          )
        `)
        .single();

      if(error) throw error;
      return response(200,{success:true,pedido:data});
    }

    if(action==="change-status"){
      const estado=String(body.estado||"").trim();
      if(!ESTADOS_VALIDOS.includes(estado)){
        return response(400,{success:false,error:"Estado inválido"});
      }
      const {data,error}=await supabase.from("pedidos").update({estado}).eq("id",pedidoId)
        .select("id, folio, cliente, total_pares, estado, creado_en, actualizado_en").single();
      if(error) throw error;
      return response(200,{success:true,pedido:data});
    }

    if(action==="delete-order"){
      const {data,error}=await supabase.from("pedidos").delete().eq("id",pedidoId).select("id, folio").single();
      if(error) throw error;
      return response(200,{success:true,eliminado:data});
    }

    return response(400,{success:false,error:"Acción no reconocida"});
  }catch(error){
    console.error("ADMIN PEDIDOS ERROR:",error);
    return response(500,{success:false,error:"Ocurrió un error administrando los pedidos"});
  }
};