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

    /*
     * ============================
     * PROVEEDORES (solo reglas internas de presentación)
     * ============================
     */
    const proveedoresResponse = await fetch(
      `${supabaseUrl}/rest/v1/proveedores?select=id,nombre&activo=eq.true`,
      { headers }
    );
    if (!proveedoresResponse.ok) throw new Error(await proveedoresResponse.text());
    const proveedores = await proveedoresResponse.json();
    const nombreProveedor = new Map(
      proveedores.map(p => [Number(p.id), String(p.nombre || "").toLowerCase()])
    );

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

    const productos = modelos.map(
      modelo => ({
        id: modelo.id,
        modelo: modelo.modelo,
        // Orden interno estable por ID de proveedor:
        // 1: Don Valente (2), 2: Noé (8), 3: Carla Franco (10), 4: resto.
        proveedor_orden: (() => {
          const ids = variantes
            .filter(v => Number(v.modelo_id) === Number(modelo.id))
            .map(v => Number(v.proveedor_id));
          if (ids.includes(2)) return 1;
          if (ids.includes(8)) return 2;
          if (ids.includes(10)) return 3;
          return 4;
        })(),

        /*
         * Puede ser null en modelos
         * antiguos todavía sin categoría.
         */
        categoria:
          modelo.categoria || null,

        // Portada independiente del stock: Valente prioriza Coñac y Noé Camel.
        // Solo usa variantes e imágenes ya obtenidas; no agrega peticiones externas.
        portada_url: (() => {
          const candidatas = variantes
            .filter(v => Number(v.modelo_id) === Number(modelo.id))
            .map(v => {
              const proveedorId = Number(v.proveedor_id);
              const color = String(v.color || "").toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              let prioridad = 1;
              if (proveedorId === 2 && (color.includes("conac") || color.includes("cognac"))) prioridad = 0;
              if (proveedorId === 8 && color.includes("camel")) prioridad = 0;
              const foto = imagenes
                .filter(i => Number(i.variante_id) === Number(v.id))
                .sort((a,b) => (a.orden ?? 999) - (b.orden ?? 999))[0];
              return { prioridad, url: foto ? foto.url : "" };
            })
            .filter(item => item.url)
            .sort((a,b) => a.prioridad - b.prioridad);
          return candidatas.length ? candidatas[0].url : "";
        })(),

        variantes: variantes
          .filter(
            v =>
              Number(v.modelo_id) === Number(modelo.id) &&
              (includeOutOfStock || (stockPorVariante.get(Number(v.id)) || 0) > 0)
          )
          .map(v => ({
            id: v.id,
            color: v.color,
            // Prioridad visual calculada en servidor; el nombre del proveedor no se expone.
            portada_prioridad: (() => {
              const proveedor = nombreProveedor.get(Number(v.proveedor_id)) || "";
              const color = String(v.color || "").toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              if ((proveedor.includes("noe") || proveedor.includes("cristina calderon")) && color.includes("camel")) return 0;
              if (proveedor.includes("valente") && (color.includes("conac") || color.includes("cognac"))) return 0;
              return 1;
            })(),
            existencia: stockPorVariante.get(Number(v.id)) || 0,
            precio_compra: Number(v.precio_compra || 0),
            precio_venta: Number(v.precio_venta || 0),
            proveedor_id: v.proveedor_id ? Number(v.proveedor_id) : null,

            imagenes: imagenes
              .filter(
                i =>
                  Number(i.variante_id) ===
                  Number(v.id)
              )
              .sort(
                (a, b) =>
                  (a.orden ?? 999) -
                  (b.orden ?? 999)
              )
          }))
      })
    );

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
