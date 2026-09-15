const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

const ESTADOS_VALIDOS = [
  "Nuevo",
  "Confirmado",
  "Surtido",
  "Enviado",
  "Cancelado"
];

function response(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function authorized(event) {
  const password =
    event.headers["x-admin-password"] ||
    event.headers["X-Admin-Password"];

  return (
    process.env.ADMIN_PASSWORD &&
    password === process.env.ADMIN_PASSWORD
  );
}

exports.handler = async function(event) {

  /* =========================
     SEGURIDAD
  ========================= */

  if (!authorized(event)) {
    return response(401, {
      success: false,
      error: "Contraseña incorrecta"
    });
  }

  try {

    /* =========================
       GET = LISTAR PEDIDOS
    ========================= */

    if (event.httpMethod === "GET") {

      const {
        data: pedidos,
        error
      } = await supabase
        .from("pedidos")
        .select(`
          id,
          folio,
          cliente,
          total_pares,
          estado,
          creado_en,
          actualizado_en,
          pedido_detalles (
            id,
            modelo,
            color,
            cantidad
          )
        `)
        .order(
          "creado_en",
          { ascending: false }
        );

      if (error) {
        console.error(
          "Error obteniendo pedidos:",
          error
        );

        throw error;
      }

      return response(200, {
        success: true,
        count: pedidos.length,
        pedidos
      });
    }

    /* =========================
       SOLO POST DESDE AQUÍ
    ========================= */

    if (event.httpMethod !== "POST") {
      return response(405, {
        success: false,
        error: "Método no permitido"
      });
    }

    let body;

    try {
      body = JSON.parse(
        event.body || "{}"
      );
    } catch {
      return response(400, {
        success: false,
        error: "Datos inválidos"
      });
    }

    const action =
      String(body.action || "");

    /* =========================
       CAMBIAR ESTADO
    ========================= */

    if (action === "change-status") {

      const pedidoId =
        Number(body.pedido_id);

      const estado =
        String(body.estado || "")
          .trim();

      if (
        !Number.isInteger(pedidoId) ||
        pedidoId <= 0
      ) {
        return response(400, {
          success: false,
          error: "Pedido inválido"
        });
      }

      if (
        !ESTADOS_VALIDOS.includes(
          estado
        )
      ) {
        return response(400, {
          success: false,
          error: "Estado inválido"
        });
      }

      const {
        data,
        error
      } = await supabase
        .from("pedidos")
        .update({
          estado
        })
        .eq(
          "id",
          pedidoId
        )
        .select(`
          id,
          folio,
          cliente,
          total_pares,
          estado,
          creado_en,
          actualizado_en
        `)
        .single();

      if (error) {
        console.error(
          "Error cambiando estado:",
          error
        );

        throw error;
      }

      return response(200, {
        success: true,
        pedido: data
      });
    }

    /* =========================
       ELIMINAR PEDIDO
    ========================= */

    if (action === "delete-order") {

      const pedidoId =
        Number(body.pedido_id);

      if (
        !Number.isInteger(pedidoId) ||
        pedidoId <= 0
      ) {
        return response(400, {
          success: false,
          error: "Pedido inválido"
        });
      }

      /*
       * pedido_detalles se elimina
       * automáticamente porque la
       * FK usa ON DELETE CASCADE.
       */

      const {
        data,
        error
      } = await supabase
        .from("pedidos")
        .delete()
        .eq(
          "id",
          pedidoId
        )
        .select("id, folio")
        .single();

      if (error) {
        console.error(
          "Error eliminando pedido:",
          error
        );

        throw error;
      }

      return response(200, {
        success: true,
        eliminado: data
      });
    }

    /* =========================
       ACCIÓN DESCONOCIDA
    ========================= */

    return response(400, {
      success: false,
      error: "Acción no reconocida"
    });

  } catch (error) {

    console.error(
      "ADMIN PEDIDOS ERROR:",
      error
    );

    return response(500, {
      success: false,
      error:
        "Ocurrió un error administrando los pedidos"
    });
  }
};
