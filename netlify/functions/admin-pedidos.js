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
      const {data:order,error:oe}=await supabase.from("pedidos").select(SELECT_ORDER).eq("id",pedidoId).single();
      if(oe)throw oe;
      if(order.estado==="Enviado") return response(200,{success:true,pedido:order,already_sent:true});

      const details=Array.isArray(order.pedido_detalles)?order.pedido_detalles:[];
      if(!details.length)return response(400,{success:false,error:"El pedido no tiene productos"});

      // Validate all inventory first, so a failed shipment never partially discounts stock.
      const deductions=[];
      let orderProfit=0;
      for(const item of details){
        const {data:model,error:me}=await supabase.from("modelos").select("id").eq("modelo",String(item.modelo)).maybeSingle();
        if(me||!model)return response(409,{success:false,error:"No se encontró el modelo "+item.modelo+" en inventario"});
        const {data:vars,error:ve}=await supabase.from("variantes").select("id,color,precio_compra").eq("modelo_id",model.id).eq("activo",true);
        if(ve)throw ve;
        const norm=v=>String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
        const variant=(vars||[]).find(v=>norm(v.color)===norm(item.color));
        if(!variant)return response(409,{success:false,error:"No se encontró "+item.modelo+" "+item.color+" en inventario"});
        const {data:stock,error:se}=await supabase.from("inventario_mayoreo").select("existencia").eq("variante_id",variant.id).maybeSingle();
        if(se)throw se;
        const current=Number(stock?.existencia||0),qty=Number(item.cantidad||0);
        if(!Number.isFinite(qty)||qty<=0||current<qty)return response(409,{success:false,error:"Existencia insuficiente para "+item.modelo+" "+item.color+". Hay "+current+" pares y el pedido requiere "+qty+"."});
        deductions.push({variantId:variant.id,current,qty});
        orderProfit+=qty*(Number(item.precio_unitario||0)-Number(variant.precio_compra||0));
      }
      for(const d of deductions){
        const {error}=await supabase.from("inventario_mayoreo").upsert({variante_id:d.variantId,existencia:d.current-d.qty,actualizado_en:new Date().toISOString()},{onConflict:"variante_id"});
        if(error)throw error;
      }
      const sentNow=new Date(),sentDate=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).format(sentNow);
      orderProfit=Math.round((orderProfit+Number.EPSILON)*100)/100;
      const {data,error}=await supabase.from("pedidos").update({estado:"Enviado",fecha_envio:sentDate,ganancia_pedido:orderProfit,actualizado_en:sentNow.toISOString()}).eq("id",pedidoId).select(SELECT_ORDER).single();
      if(error)throw error;
      return response(200,{success:true,pedido:data});
    }

    if(action==="change-status"){
      const estado=String(body.estado||"").trim();
      if(!ESTADOS_VALIDOS.includes(estado)) return response(400,{success:false,error:"Estado inválido"});
      const {data,error}=await supabase.from("pedidos").update({estado}).eq("id",pedidoId).select(SELECT_ORDER).single();
      if(error) throw error;
      return response(200,{success:true,pedido:data});
    }

    if(action==="delete-order"){
      const {data:original,error:originalError}=await supabase.from("pedidos").select(SELECT_ORDER).eq("id",pedidoId).single();
      if(originalError) throw originalError;
      const audit={
        tipo:"pedido",registro_id:original.id,folio:original.folio,cliente:original.nota_cliente||original.cliente||"",
        fecha_original:original.fecha_envio||original.nota_fecha||String(original.creado_en||"").slice(0,10)||null,
        estado:original.estado||"",total_pares:Number(original.total_pares||0),total:Number(original.nota_total||0),
        ganancia:Number(original.ganancia_pedido||0),detalle:Array.isArray(original.pedido_detalles)?original.pedido_detalles:[],datos_originales:original
      };
      const {error:auditError}=await supabase.from("registros_eliminados").insert(audit);
      if(auditError) throw auditError;
      const {data,error}=await supabase.from("pedidos").delete().eq("id",pedidoId).select("id, folio").single();
      if(error) throw error;
      return response(200,{success:true,eliminado:data});
    }

    return response(400,{success:false,error:"Acción no reconocida"});
  }catch(error){
    console.error("ADMIN PEDIDOS ERROR:",error);
    return response(500,{success:false,error:error.message||"Ocurrió un error administrando los pedidos"});
  }
};