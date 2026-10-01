const {authorized}=require("./admin-auth-lib");
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


function cleanText(value,max=120){
  return String(value||"").trim().replace(/\s+/g," ").slice(0,max);
}

const SELECT_ORDER = `
  id, folio, cliente, total_pares, estado, creado_en, actualizado_en, fecha_envio, ganancia_pedido,
  nota_cliente, nota_fecha, nota_total, nota_guardada, nota_actualizada_en,
  pedido_detalles (
    id, modelo, color, cantidad, precio_unitario, importe
  )
`;

exports.handler=async function(event){
  if(!(await authorized(event))) return response(401,{success:false,error:"Contraseña incorrecta"});

  try{
    if(event.httpMethod==="GET"){
      const {data,error}=await supabase.from("pedidos").select(SELECT_ORDER).order("creado_en",{ascending:false});
      if(error) throw error;
      const {data:eliminados,error:deletedError}=await supabase.from("registros_eliminados").select("id,tipo,registro_id,folio,cliente,fecha_original,fecha_eliminado,estado,total_pares,total,ganancia,detalle").order("fecha_eliminado",{ascending:false}).limit(200);
      if(deletedError) throw deletedError;
      return response(200,{success:true,count:(data||[]).length,pedidos:data||[],eliminados:eliminados||[]});
    }

    if(event.httpMethod!=="POST") return response(405,{success:false,error:"Método no permitido"});

    let body={};
    try{body=JSON.parse(event.body||"{}");}
    catch{return response(400,{success:false,error:"Datos inválidos"});}

    const action=String(body.action||"");

    if(action==="create-manual"){
      const cliente=cleanText(body.cliente);
      const fecha=String(body.fecha||"").trim();
      const items=Array.isArray(body.items)?body.items:[];
      if(!cliente) return response(400,{success:false,error:"Falta el nombre del cliente"});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return response(400,{success:false,error:"Fecha inválida"});
      if(!items.length) return response(400,{success:false,error:"Agrega al menos un producto"});
      const {data:id,error:createError}=await supabase.rpc("crear_pedido_manual",{
        p_cliente:cliente,
        p_catalogo_cliente_id:Number(body.catalogo_cliente_id)||null,
        p_cliente_deuda_id:Number(body.cliente_deuda_id)||null,
        p_fecha:fecha,
        p_items:items
      });
      if(createError)throw createError;
      const {data,error}=await supabase.from("pedidos").select(SELECT_ORDER).eq("id",id).single();
      if(error)throw error;
      return response(200,{success:true,pedido:data});
    }

    const pedidoId=Number(body.pedido_id);
    if(!Number.isInteger(pedidoId)||pedidoId<=0) return response(400,{success:false,error:"Pedido inválido"});

    if(action==="save-note"){
      const cliente=cleanText(body.cliente);
      const fecha=String(body.fecha||"").trim();
      const items=Array.isArray(body.items)?body.items:[];
      const extras=Array.isArray(body.extras)?body.extras:[];

      if(!cliente) return response(400,{success:false,error:"Falta el nombre del cliente"});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return response(400,{success:false,error:"Fecha inválida"});
      if(!items.length && !extras.length) return response(400,{success:false,error:"La nota no tiene productos"});

      // Lines removed in the editor are deleted from the order as well.
      const keptIds=items.map(x=>Number(x.id)).filter(Number.isInteger);
      const {data:currentDetails,error:currentError}=await supabase.from("pedido_detalles").select("id").eq("pedido_id",pedidoId);
      if(currentError)throw currentError;
      const removedIds=(currentDetails||[]).map(x=>Number(x.id)).filter(id=>!keptIds.includes(id));
      if(removedIds.length){
        const {error:deleteError}=await supabase.from("pedido_detalles").delete().eq("pedido_id",pedidoId).in("id",removedIds);
        if(deleteError)throw deleteError;
      }

      let total=0;
      for(const item of items){
        const detailId=Number(item.id);
        const cantidad=Number(item.cantidad);
        const precio=Number(item.precio_unitario);
        if(!Number.isInteger(detailId)||detailId<=0||!Number.isFinite(cantidad)||cantidad<=0||!Number.isFinite(precio)||precio<0){
          return response(400,{success:false,error:"Hay productos o precios inválidos"});
        }
        const importe=Math.round((cantidad*precio+Number.EPSILON)*100)/100;
        total+=importe;
        const {error}=await supabase.from("pedido_detalles")
          .update({cantidad,precio_unitario:precio,importe})
          .eq("id",detailId).eq("pedido_id",pedidoId);
        if(error) throw error;
      }

      for(const extra of extras){
        const cantidad=Number(extra.cantidad);
        const concepto=cleanText(extra.concepto);
        const precio=Number(extra.precio_unitario);
        if(!Number.isFinite(cantidad)||cantidad<=0||!concepto||!Number.isFinite(precio)||precio<0){
          return response(400,{success:false,error:"Hay extras inválidos"});
        }
        total+=cantidad*precio;
      }
      total=Math.round((total+Number.EPSILON)*100)/100;

      const {data:remainingDetails,error:remainingError}=await supabase.from("pedido_detalles").select("cantidad").eq("pedido_id",pedidoId);
      if(remainingError)throw remainingError;
      const totalPares=(remainingDetails||[]).reduce((sum,x)=>sum+Number(x.cantidad||0),0);

      const updateData={
        nota_cliente:cliente,
        nota_fecha:fecha,
        nota_total:total,
        nota_guardada:true,
        nota_actualizada_en:new Date().toISOString(),
        estado:"Confirmado",
        total_pares:totalPares
      };

      // nota_extras es opcional para que el registro siga funcionando
      // aunque la migración de esa columna aún no se haya aplicado.
      const {data:probe}=await supabase.from("pedidos").select("nota_extras").eq("id",pedidoId).maybeSingle();
      if(probe && Object.prototype.hasOwnProperty.call(probe,"nota_extras")) updateData.nota_extras=extras;

      const {data,error}=await supabase.from("pedidos").update(updateData).eq("id",pedidoId).select(SELECT_ORDER).single();
      if(error) throw error;
      if(updateData.nota_extras!==undefined) data.nota_extras=extras;
      return response(200,{success:true,pedido:data});
    }

    if(action==="mark-sent"){
      const paymentMethod=cleanText(body.forma_pago,30)||"Deuda";
      const clientId=Number(body.cliente_id);
      if(!Number.isInteger(clientId)||clientId<=0) return response(400,{success:false,error:"Cliente inválido"});
      const sentDate=cleanText(body.fecha_envio,10)||null;
      if(sentDate&&!/^\d{4}-\d{2}-\d{2}$/.test(sentDate)) return response(400,{success:false,error:"Fecha de envío inválida"});
      const {data:atomic,error:atomicError}=await supabase.rpc("enviar_pedido_atomico",{
        p_pedido_id:pedidoId,p_forma_pago:paymentMethod,p_cliente_id:clientId,p_fecha_envio:sentDate
      });
      if(atomicError) throw atomicError;
      const {data,error}=await supabase.from("pedidos").select(SELECT_ORDER).eq("id",pedidoId).single();
      if(error)throw error;
      return response(200,{success:true,pedido:data,already_sent:Boolean(atomic?.already_sent)});
    }

    if(action==="change-status"){
      const estado=String(body.estado||"").trim();
      if(!ESTADOS_VALIDOS.includes(estado)) return response(400,{success:false,error:"Estado inválido"});
      const {data,error}=await supabase.from("pedidos").update({estado}).eq("id",pedidoId).select(SELECT_ORDER).single();
      if(error) throw error;
      return response(200,{success:true,pedido:data});
    }

    if(action==="delete-order"){
      const {data:deleted,error}=await supabase.rpc("eliminar_pedido_atomico",{p_pedido_id:pedidoId});
      if(error)throw error;
      return response(200,{success:true,eliminado:deleted});
    }

    return response(400,{success:false,error:"Acción no reconocida"});
  }catch(error){
    console.error("ADMIN PEDIDOS ERROR:",error);
    return response(500,{success:false,error:error.message||"Ocurrió un error administrando los pedidos"});
  }
};