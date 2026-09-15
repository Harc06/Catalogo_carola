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

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanText(value, maxLength = 100) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function validQuantity(value) {
  const quantity = Number(value);

  return (
    Number.isInteger(quantity) &&
    quantity >= 6 &&
    quantity % 6 === 0
  );
}

function generateFolio() {
  const now = new Date();

  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return `CAR-${day}${month}${year}-${random}`;
}

exports.handler = async function(event) {

  /* =========================
     SOLO POST
  ========================= */

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        error: "Método no permitido"
      })
    };
  }

  try {

    /* =========================
       LEER PEDIDO
    ========================= */

    let body;

    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          error: "Datos inválidos"
        })
      };
    }

    const cliente = cleanText(
      body.cliente,
      120
    );

    const items = Array.isArray(body.items)
      ? body.items
      : [];

    /* =========================
       VALIDAR CLIENTE
    ========================= */

    if (!cliente) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          error: "Falta el nombre del cliente"
        })
      };
    }

    /* =========================
       VALIDAR PRODUCTOS
    ========================= */

    if (!items.length) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          error: "El pedido está vacío"
        })
      };
    }

    /*
     * LIMPIAR Y UNIR
     * MODELO + COLOR REPETIDOS
     */

    const grouped = new Map();

    for (const item of items) {

      const modelo = cleanText(
        item.modelo,
        80
      );

      const color = cleanText(
        item.color,
        80
      );

      const cantidad = Number(
        item.cantidad
      );

      if (
        !modelo ||
        !color ||
        !validQuantity(cantidad)
      ) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            success: false,
            error: "Hay productos inválidos en el pedido"
          })
        };
      }

      const key =
        normalize(modelo) +
        "|" +
        normalize(color);

      if (grouped.has(key)) {

        grouped.get(key).cantidad +=
          cantidad;

      } else {

        grouped.set(key, {
          modelo,
          color,
          cantidad
        });
      }
    }

    const detalles =
      Array.from(
        grouped.values()
      );

    const totalPares =
      detalles.reduce(
        (total, item) =>
          total + item.cantidad,
        0
      );

    if (
      totalPares < 6 ||
      totalPares % 6 !== 0
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          error: "Cantidad total inválida"
        })
      };
    }

    /* =========================
       CREAR FOLIO
    ========================= */

    let pedido = null;

    let lastError = null;

    /*
     * Intentamos varias veces
     * por si dos pedidos generan
     * casualmente el mismo folio.
     */

    for (
      let attempt = 0;
      attempt < 5;
      attempt++
    ) {

      const folio =
        generateFolio();

      const {
        data,
        error
      } =
        await supabase
          .from("pedidos")
          .insert({
            folio,
            cliente,
            total_pares:
              totalPares,
            estado:
              "Nuevo"
          })
          .select(
            "id, folio, cliente, total_pares, estado, creado_en"
          )
          .single();

      if (!error && data) {

        pedido = data;

        break;
      }

      lastError = error;

      /*
       * 23505 =
       * folio duplicado
       */

      if (
        error?.code !== "23505"
      ) {
        break;
      }
    }

    if (!pedido) {

      console.error(
        "Error creando pedido:",
        lastError
      );

      throw new Error(
        "No se pudo crear el pedido"
      );
    }

    /* =========================
       GUARDAR DETALLES
    ========================= */

    const detallesInsert =
      detalles.map(
        item => ({
          pedido_id:
            pedido.id,

          modelo:
            item.modelo,

          color:
            item.color,

          cantidad:
            item.cantidad
        })
      );

    const {
      error: detailError
    } =
      await supabase
        .from(
          "pedido_detalles"
        )
        .insert(
          detallesInsert
        );

    /* =========================
       ROLLBACK
    ========================= */

    if (detailError) {

      console.error(
        "Error detalles:",
        detailError
      );

      /*
       * Si fallan los productos,
       * eliminamos el pedido para
       * no dejar pedidos vacíos.
       */

      const {
        error: rollbackError
      } =
        await supabase
          .from("pedidos")
          .delete()
          .eq(
            "id",
            pedido.id
          );

      if (rollbackError) {
        console.error(
          "Error rollback:",
          rollbackError
        );
      }

      throw new Error(
        "No se pudieron guardar los productos"
      );
    }

    /* =========================
       RESPUESTA
    ========================= */

    return {
      statusCode: 200,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store"
      },

      body: JSON.stringify({
        success: true,

        pedido: {
          id:
            pedido.id,

          folio:
            pedido.folio,

          cliente:
            pedido.cliente,

          total_pares:
            pedido.total_pares,

          estado:
            pedido.estado,

          creado_en:
            pedido.creado_en,

          items:
            detalles
        }
      })
    };

  } catch (error) {

    console.error(
      "PEDIDOS ERROR:",
      error
    );

    return {
      statusCode: 500,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store"
      },

      body: JSON.stringify({
        success: false,
        error:
          "No se pudo guardar el pedido"
      })
    };
  }
};
