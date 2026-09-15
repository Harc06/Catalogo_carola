const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type, x-admin-password",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS"
  };


  /*
   * PREFLIGHT
   */

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }


  /*
   * SOLO POST
   */

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Método no permitido"
      })
    };
  }


  /*
   * CONTRASEÑA
   */

  const adminPassword =
    process.env.ADMIN_PASSWORD;

  const providedPassword =
    event.headers["x-admin-password"] ||
    event.headers["X-Admin-Password"];


  if (
    !adminPassword ||
    providedPassword !== adminPassword
  ) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Acceso no autorizado"
      })
    };
  }


  /*
   * VARIABLES SUPABASE
   */

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;


  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error:
          "Faltan variables de Supabase en Netlify."
      })
    };
  }


  const supabase =
    createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );


  try {

    /*
     * LEER BODY
     */

    let body;

    try {
      body =
        JSON.parse(event.body || "{}");
    } catch (error) {
      throw new Error(
        "El cuerpo de la solicitud no es válido."
      );
    }


    const modelo =
      String(body.modelo || "").trim();

    const color =
      String(body.color || "").trim();

    const imagenes =
      Array.isArray(body.imagenes)
        ? body.imagenes
        : [];


    if (!modelo) {
      throw new Error(
        "Falta el modelo."
      );
    }


    if (!color) {
      throw new Error(
        "Falta el color."
      );
    }


    if (imagenes.length === 0) {
      throw new Error(
        "No se recibieron fotografías."
      );
    }


    /*
     * 1. BUSCAR MODELO
     */

    let modeloId = null;


    const {
      data: modelosEncontrados,
      error: buscarModeloError
    } =
      await supabase
        .from("modelos")
        .select("id, modelo")
        .ilike("modelo", modelo)
        .limit(1);


    if (buscarModeloError) {
      throw new Error(
        "Error buscando modelo: " +
        buscarModeloError.message
      );
    }


    if (
      modelosEncontrados &&
      modelosEncontrados.length > 0
    ) {

      modeloId =
        modelosEncontrados[0].id;

    } else {

      /*
       * CREAR MODELO
       */

      const {
        data: nuevoModelo,
        error: crearModeloError
      } =
        await supabase
          .from("modelos")
          .insert({
            modelo: modelo,
            activo: true
          })
          .select("id")
          .single();


      if (crearModeloError) {
        throw new Error(
          "Error creando modelo: " +
          crearModeloError.message
        );
      }


      modeloId =
        nuevoModelo.id;
    }


    /*
     * 2. BUSCAR VARIANTE
     */

    let varianteId = null;


    const {
      data: variantesEncontradas,
      error: buscarVarianteError
    } =
      await supabase
        .from("variantes")
        .select("id, color")
        .eq("modelo_id", modeloId)
        .ilike("color", color)
        .limit(1);


    if (buscarVarianteError) {
      throw new Error(
        "Error buscando color: " +
        buscarVarianteError.message
      );
    }


    if (
      variantesEncontradas &&
      variantesEncontradas.length > 0
    ) {

      varianteId =
        variantesEncontradas[0].id;

    } else {

      /*
       * CREAR VARIANTE
       */

      const {
        data: nuevaVariante,
        error: crearVarianteError
      } =
        await supabase
          .from("variantes")
          .insert({
            modelo_id: modeloId,
            color: color,
            activo: true
          })
          .select("id")
          .single();


      if (crearVarianteError) {
        throw new Error(
          "Error creando color: " +
          crearVarianteError.message
        );
      }


      varianteId =
        nuevaVariante.id;
    }


    /*
     * 3. OBTENER ÚLTIMO ORDEN
     */

    const {
      data: ultimaImagen,
      error: ordenError
    } =
      await supabase
        .from("imagenes")
        .select("orden")
        .eq(
          "variante_id",
          varianteId
        )
        .order(
          "orden",
          {
            ascending: false
          }
        )
        .limit(1);


    if (ordenError) {
      throw new Error(
        "Error consultando orden: " +
        ordenError.message
      );
    }


    let siguienteOrden = 1;


    if (
      ultimaImagen &&
      ultimaImagen.length > 0
    ) {

      siguienteOrden =
        Number(
          ultimaImagen[0].orden || 0
        ) + 1;
    }


    /*
     * 4. SUBIR CADA FOTO
     */

    const resultados = [];


    for (
      let i = 0;
      i < imagenes.length;
      i++
    ) {

      const imagen =
        imagenes[i];


      if (
        !imagen ||
        !imagen.data
      ) {
        throw new Error(
          "Una de las fotografías no contiene datos."
        );
      }


      /*
       * EXTENSIÓN
       */

      let extension = "jpg";


      if (
        imagen.type === "image/png"
      ) {
        extension = "png";
      }


      if (
        imagen.type === "image/webp"
      ) {
        extension = "webp";
      }


      if (
        imagen.type === "image/jpeg"
      ) {
        extension = "jpg";
      }


      /*
       * NOMBRE ÚNICO
       */

      const uniqueName =
        Date.now() +
        "-" +
        i +
        "-" +
        Math.random()
          .toString(36)
          .substring(2, 8) +
        "." +
        extension;


      const safeModelo =
        modelo.replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        );


      const safeColor =
        color
          .toLowerCase()
          .replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
          );


      const storagePath =
        safeModelo +
        "/" +
        safeColor +
        "/" +
        uniqueName;


      /*
       * BASE64 → BUFFER
       */

      const buffer =
        Buffer.from(
          imagen.data,
          "base64"
        );


      if (!buffer.length) {
        throw new Error(
          "La fotografía está vacía."
        );
      }


      /*
       * SUBIR A STORAGE
       */

      const {
        error: uploadError
      } =
        await supabase.storage
          .from("Productos")
          .upload(
            storagePath,
            buffer,
            {
              contentType:
                imagen.type ||
                "image/jpeg",

              upsert: false
            }
          );


      if (uploadError) {
        throw new Error(
          "Error subiendo fotografía: " +
          uploadError.message
        );
      }


      /*
       * OBTENER URL PÚBLICA
       */

      const {
        data: publicData
      } =
        supabase.storage
          .from("Productos")
          .getPublicUrl(
            storagePath
          );


      const publicUrl =
        publicData &&
        publicData.publicUrl
          ? publicData.publicUrl
          : "";


      if (!publicUrl) {

        /*
         * Si no conseguimos URL,
         * eliminamos el archivo.
         */

        await supabase.storage
          .from("Productos")
          .remove([
            storagePath
          ]);


        throw new Error(
          "No se pudo obtener la URL pública de la fotografía."
        );
      }


      /*
       * 5. INSERTAR EN TABLA IMAGENES
       *
       * ESTE ES EL PASO QUE NOS
       * INTERESA GARANTIZAR.
       */

      const orden =
        siguienteOrden + i;


      const {
        data: imagenInsertada,
        error: insertarImagenError
      } =
        await supabase
          .from("imagenes")
          .insert({
            variante_id:
              varianteId,

            url:
              publicUrl,

            orden:
              orden
          })
          .select(
            "id, variante_id, url, orden"
          )
          .single();


      if (insertarImagenError) {

        /*
         * Si falla la BD,
         * borramos la foto de Storage
         * para no dejar archivos huérfanos.
         */

        await supabase.storage
          .from("Productos")
          .remove([
            storagePath
          ]);


        throw new Error(
          "La fotografía llegó a Storage, " +
          "pero no pudo registrarse en la tabla imagenes: " +
          insertarImagenError.message
        );
      }


      /*
       * COMPROBAR QUE REALMENTE
       * RECIBIMOS EL REGISTRO.
       */

      if (
        !imagenInsertada ||
        !imagenInsertada.id
      ) {

        await supabase.storage
          .from("Productos")
          .remove([
            storagePath
          ]);


        throw new Error(
          "Supabase no confirmó el registro de la fotografía."
        );
      }


      resultados.push({
        id:
          imagenInsertada.id,

        variante_id:
          imagenInsertada.variante_id,

        url:
          imagenInsertada.url,

        orden:
          imagenInsertada.orden
      });

    }


    /*
     * 6. VERIFICACIÓN FINAL
     */

    const {
      data: verificacion,
      error: verificarError
    } =
      await supabase
        .from("imagenes")
        .select(
          "id, variante_id, url, orden"
        )
        .eq(
          "variante_id",
          varianteId
        )
        .order(
          "orden",
          {
            ascending: true
          }
        );


    if (verificarError) {
      throw new Error(
        "Las fotografías se subieron, " +
        "pero falló la verificación final: " +
        verificarError.message
      );
    }


    /*
     * ÉXITO SOLO DESPUÉS
     * DE INSERTAR EN LA BD.
     */

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,

        modelo:
          modelo,

        color:
          color,

        modelo_id:
          modeloId,

        variante_id:
          varianteId,

        subidas:
          resultados.length,

        total_fotografias:
          verificacion.length,

        imagenes:
          resultados
      })
    };


  } catch (error) {

    console.error(
      "ADMIN UPLOAD ERROR:",
      error
    );


    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,

        error:
          error &&
          error.message
            ? error.message
            : String(error)
      })
    };
  }
};
