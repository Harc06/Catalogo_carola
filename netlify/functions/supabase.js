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
    const normalizar = value => String(value || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nombreProveedor = new Map(
      proveedores.map(p => [Number(p.id), normalizar(p.nombre)])
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
        // Orden interno del catálogo. No expone el nombre del proveedor.
        // 1: Don Valente, 2: Noé, 3: zapatillas restantes, 4: todo lo demás.
        proveedor_orden: (() => {
          const nombres = variantes
            .filter(v => Number(v.modelo_id) === Number(modelo.id))
            .map(v => nombreProveedor.get(Number(v.proveedor_id)) || "");
          if (nombres.some(nombre => nombre.includes("valente"))) return 1;
          if (nombres.some(nombre => nombre.includes("noe") || nombre.includes("cristina calderon"))) return 2;
          const categoria = String(modelo.categoria || "").toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (categoria === "zapatilla") return 3;
          return 4;
        })(),

        /*
         * Puede ser null en modelos
         * antiguos todavía sin categoría.
         */
        categoria:
          modelo.categoria || null,

        // La portada puede venir de un color agotado sin ofrecerlo como disponible.
        // Don Valente prioriza Coñac y Noé prioriza Camel.
        portada_url: (() => {
          const candidatas = variantes
            .filter(v => Number(v.modelo_id) === Number(modelo.id))
            .map(v => {
              const proveedor = nombreProveedor.get(Number(v.proveedor_id)) || "";
              const color = normalizar(v.color);
              let prioridad = 1;
              if (proveedor.includes("valente") && (color.includes("conac") || color.includes("cognac"))) prioridad = 0;
              if ((proveedor.includes("noe") || proveedor.includes("cristina calderon")) && color.includes("camel")) prioridad = 0;
              const foto = imagenes
                .filter(i => Number(i.variante_id) === Number(v.id))
                .sort((a,b) => (a.orden ?? 999) - (b.orden ?? 999))[0]?.url || "";
              return { prioridad, foto };
            })
            .filter(item => item.foto)
            .sort((a,b) => a.prioridad - b.prioridad);
          return candidatas[0]?.foto || "";
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
              const color = normalizar(v.color);
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
