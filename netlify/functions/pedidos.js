const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") return reply(405, { success: false, error: "Método no permitido" });
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return reply(400, { success: false, error: "Datos inválidos" }); }
  if (!body || typeof body.cliente !== "string" || !Array.isArray(body.items)) {
    return reply(400, { success: false, error: "Datos inválidos" });
  }
  // Old cached clients still work; the database also deduplicates by canonical content.
  const requestId = body.request_id || randomUUID();
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return reply(400, { success: false, error: "Identificador de pedido inválido" });
  }
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabase.rpc("crear_pedido_catalogo", {
      p_cliente: body.cliente, p_items: body.items, p_request_id: requestId
    });
    if (error) {
      if (error.code === "P0001") return reply(409, { success: false, error: error.message });
      throw error;
    }
    if (!data?.folio || !Array.isArray(data.items)) throw new Error("Respuesta de pedido inválida");
    return reply(200, { success: true, pedido: data });
  } catch (error) {
    console.error("PEDIDOS ERROR:", error);
    return reply(500, { success: false, error: "No se pudo confirmar el pedido. Reintenta: conservaremos el mismo intento para evitar duplicados." });
  }
};
