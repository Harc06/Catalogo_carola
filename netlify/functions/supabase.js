exports.handler = async function (event) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Faltan variables de Supabase");
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    };

    /*
     * ============================
     * MODELOS
     * ============================
     */

    const modelosResponse = await fetch(
      `${supabaseUrl}/rest/v1/modelos?select=id,modelo,categoria,activo&activo=eq.true&order=modelo.asc`,
      { headers }
    );

    if (!modelosResponse.ok) {
      throw new Error(
        await modelosResponse.text()
      );
    }

    const modelos =
      await modelosResponse.json();

    /*
     * ============================
     * VARIANTES / COLORES
     * ============================
     */

    const variantesResponse = await fetch(
      `${supabaseUrl}/rest/v1/variantes?select=id,modelo_id,color,activo,precio_compra,precio_venta,proveedor_id&activo=eq.true&order=id.asc`,
      { headers }
    );

    if (!variantesResponse.ok) {
      throw new Error(
        await variantesResponse.text()
      );
    }

    const variantes =
      await variantesResponse.json();

    // IDs internos confirmados en la base. No consultamos ni exponemos proveedores al público.
    const PROVEEDOR_DON_VALENTE = 2;
    const PROVEEDOR_NOE = 8;
    const normalizar = value => String(value || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    /*
     * ============================
     * INVENTARIO MAYOREO
     * ============================
     */
    const inventarioResponse = await fetch(
      `${supabaseUrl}/rest/v1/inventario_mayoreo?select=variante_id,existencia`,
      { headers }
    );
    if (!inventarioResponse.ok) throw new Error(await inventarioResponse.text());
    const inventario = await inventarioResponse.json();
    const stockPorVariante = new Map(inventario.map(i => [Number(i.variante_id), Number(i.existencia || 0)]));
    const includeOutOfStock = event && event.queryStringParameters && event.queryStringParameters.includeOutOfStock === "1";

    /*
     * ============================
     * IMÁGENES
     * ============================
     */

    const imagenesResponse = await fetch(
      `${supabaseUrl}/rest/v1/imagenes?select=id,variante_id,url,orden&order=orden.asc`,
      { headers }
    );

    if (!imagenesResponse.ok) {
      throw new Error(
        await imagenesResponse.text()
      );
    }

    const imagenes =
      await imagenesResponse.json();

    /*
     * ============================
     * CONSTRUIR PRODUCTOS
     * ============================
     */

    const productos = modelos.map(modelo => {
      const todasLasVariantes = variantes.filter(
        v => Number(v.modelo_id) === Number(modelo.id)
      );

      const proveedores = todasLasVariantes.map(v => Number(v.proveedor_id));
      const categoriaNormalizada = normalizar(modelo.categoria);

      let proveedorOrden = 4;
      if (proveedores.includes(PROVEEDOR_DON_VALENTE)) proveedorOrden = 1;
      else if (proveedores.includes(PROVEEDOR_NOE)) proveedorOrden = 2;
      else if (categoriaNormalizada === "zapatilla") proveedorOrden = 3;

      const variantesPublicas = todasLasVariantes
        .filter(v => includeOutOfStock || (stockPorVariante.get(Number(v.id)) || 0) > 0)
        .map(v => ({
          id: v.id,
          color: v.color,
          existencia: stockPorVariante.get(Number(v.id)) || 0,
          precio_compra: Number(v.precio_compra || 0),
          precio_venta: Number(v.precio_venta || 0),
          proveedor_id: v.proveedor_id ? Number(v.proveedor_id) : null,
          imagenes: imagenes
            .filter(i => Number(i.variante_id) === Number(v.id))
            .sort((a,b) => (a.orden ?? 999) - (b.orden ?? 999))
        }));

      const portadaPreferida = todasLasVariantes
        .map(v => {
          const proveedorId = Number(v.proveedor_id);
          const color = normalizar(v.color);
          let prioridad = 1;
          if (proveedorId === PROVEEDOR_DON_VALENTE && (color.includes("conac") || color.includes("cognac"))) prioridad = 0;
          if (proveedorId === PROVEEDOR_NOE && color.includes("camel")) prioridad = 0;
          const foto = imagenes
            .filter(i => Number(i.variante_id) === Number(v.id))
            .sort((a,b) => (a.orden ?? 999) - (b.orden ?? 999))[0];
          return { prioridad, url: foto ? foto.url : "" };
        })
        .filter(item => item.url)
        .sort((a,b) => a.prioridad - b.prioridad)[0];

      return {
        id: modelo.id,
        modelo: modelo.modelo,
        proveedor_orden: proveedorOrden,
        categoria: modelo.categoria || null,
        portada_url: portadaPreferida ? portadaPreferida.url : "",
        variantes: variantesPublicas
      };
    });

    const productosConStock = includeOutOfStock ? productos : productos.filter(p => p.variantes.length > 0);

    /*
     * ============================
     * RESPUESTA
     * ============================
     */

    return {
      statusCode: 200,

      headers: {
        "Content-Type":
          "application/json",

        "Access-Control-Allow-Origin":
          "*",

        "Cache-Control":
          "no-store"
      },

      body: JSON.stringify({
        success: true,
        count: productosConStock.length,
        productos: productosConStock
      })
    };

  } catch (error) {
    console.error(
      "SUPABASE FUNCTION ERROR:",
      error
    );

    return {
      statusCode: 500,

      headers: {
        "Content-Type":
          "application/json",

        "Access-Control-Allow-Origin":
          "*"
      },

      body: JSON.stringify({
        success: false,
        error:
          error && error.message
            ? error.message
            : String(error)
      })
    };
  }
};
