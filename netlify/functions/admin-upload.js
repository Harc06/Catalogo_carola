const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {

  const headers = {
    "Content-Type": "application/json"
  };
const adminPassword =
  process.env.ADMIN_PASSWORD;

const providedPassword =
  event.headers["x-admin-password"];

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

  try {

    const SUPABASE_URL =
      process.env.SUPABASE_URL;

    const SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Faltan las variables privadas de Supabase"
      );
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const body = JSON.parse(event.body || "{}");

    const modelo = String(body.modelo || "").trim();
    const color = String(body.color || "").trim();
    const imagenes = body.imagenes;

    if (!modelo) {
      throw new Error("Falta el modelo");
    }

    if (!color) {
      throw new Error("Falta el color");
    }

    if (!Array.isArray(imagenes) || imagenes.length === 0) {
      throw new Error("No se recibieron imágenes");
    }


    // ==========================
    // BUSCAR O CREAR MODELO
    // ==========================

    let { data: modeloExistente, error: modeloError } =
      await supabase
        .from("modelos")
        .select("*")
        .eq("modelo", modelo)
        .maybeSingle();

    if (modeloError) {
      throw modeloError;
    }

    if (!modeloExistente) {

      const { data: nuevoModelo, error } =
        await supabase
          .from("modelos")
          .insert({
            modelo: modelo,
            activo: true
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      modeloExistente = nuevoModelo;
    }


    // ==========================
    // BUSCAR O CREAR COLOR
    // ==========================

    let { data: varianteExistente, error: varianteError } =
      await supabase
        .from("variantes")
        .select("*")
        .eq("modelo_id", modeloExistente.id)
        .ilike("color", color)
        .maybeSingle();

    if (varianteError) {
      throw varianteError;
    }

    if (!varianteExistente) {

      const { data: nuevaVariante, error } =
        await supabase
          .from("variantes")
          .insert({
            modelo_id: modeloExistente.id,
            color: color,
            activo: true
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      varianteExistente = nuevaVariante;
    }


    // ==========================
    // SABER EL SIGUIENTE ORDEN
    // ==========================

    const { data: imagenesActuales, error: ordenError } =
      await supabase
        .from("imagenes")
        .select("orden")
        .eq("variante_id", varianteExistente.id)
        .order("orden", { ascending: false })
        .limit(1);

    if (ordenError) {
      throw ordenError;
    }

    let siguienteOrden = 1;

    if (
      imagenesActuales &&
      imagenesActuales.length > 0 &&
      imagenesActuales[0].orden
    ) {
      siguienteOrden =
        imagenesActuales[0].orden + 1;
    }


    // ==========================
    // SUBIR IMÁGENES
    // ==========================

    const resultados = [];

    for (let i = 0; i < imagenes.length; i++) {

      const imagen = imagenes[i];

      if (!imagen.base64) {
        continue;
      }

      const extension =
        imagen.extension || "jpg";

      const contentType =
        imagen.contentType || "image/jpeg";

      const nombreSeguro =
        `${Date.now()}-${i}.${extension}`;

      const ruta =
        `${modelo}/${color}/${nombreSeguro}`;

      const buffer =
        Buffer.from(
          imagen.base64,
          "base64"
        );


      const { error: uploadError } =
        await supabase.storage
          .from("Productos")
          .upload(
            ruta,
            buffer,
            {
              contentType: contentType,
              upsert: false
            }
          );

      if (uploadError) {
        throw uploadError;
      }


      const { data: publicData } =
        supabase.storage
          .from("Productos")
          .getPublicUrl(ruta);


      const url =
        publicData.publicUrl;


      const { data: imagenGuardada, error: imagenError } =
        await supabase
          .from("imagenes")
          .insert({
            variante_id: varianteExistente.id,
            url: url,
            orden: siguienteOrden
          })
          .select()
          .single();

      if (imagenError) {
        throw imagenError;
      }


      resultados.push({
        id: imagenGuardada.id,
        url: url,
        orden: siguienteOrden
      });

      siguienteOrden++;
    }


    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        modelo: modelo,
        color: color,
        variante_id: varianteExistente.id,
        imagenes_subidas: resultados.length,
        imagenes: resultados
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
          error.message ||
          "Error desconocido"
      })
    };
  }
};
