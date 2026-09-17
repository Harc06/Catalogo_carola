exports.handler = async function () {
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
      `${supabaseUrl}/rest/v1/variantes?select=id,modelo_id,color,activo&activo=eq.true&order=id.asc`,
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

        /*
         * Puede ser null en modelos
         * antiguos todavía sin categoría.
         */
        categoria:
          modelo.categoria || null,

        variantes: variantes
          .filter(
            v =>
              Number(v.modelo_id) ===
              Number(modelo.id)
          )
          .map(v => ({
            id: v.id,
            color: v.color,

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
        count: productos.length,
        productos
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
