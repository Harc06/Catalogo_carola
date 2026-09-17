const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-password",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod === "OPTIONS") {
    return respond(200, {});
  }

  if (event.httpMethod !== "POST") {
    return respond(405, {
      success: false,
      error: "Método no permitido"
    });
  }

  const providedPassword =
    event.headers["x-admin-password"] ||
    event.headers["X-Admin-Password"];

  if (
    !process.env.ADMIN_PASSWORD ||
    providedPassword !== process.env.ADMIN_PASSWORD
  ) {
    return respond(401, {
      success: false,
      error: "Acceso no autorizado"
    });
  }

  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return respond(500, {
      success: false,
      error: "Faltan variables de Supabase."
    });
  }

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

  try {
    const body = JSON.parse(event.body || "{}");

    const modelo = String(body.modelo || "").trim();
    const color = String(body.color || "").trim();
    const categoria = cleanCategory(body.categoria);

    const imagenes = Array.isArray(body.imagenes)
      ? body.imagenes
      : [];

    if (!modelo) {
      throw new Error("Falta el modelo.");
    }

    if (!categoria) {
      throw new Error(
        "Selecciona una categoría: Bota, Botín, Mocasín, Escolar o Zapatilla."
      );
    }

    if (!color) {
      throw new Error("Falta el color.");
    }

    if (!imagenes.length) {
      throw new Error(
        "No se recibieron fotografías."
      );
    }

    /*
     * ============================
     * BUSCAR O CREAR MODELO
     * ============================
     */

    const { data: modelos, error: modelosError } =
      await supabase
        .from("modelos")
        .select("id, modelo, categoria");

    if (modelosError) {
      throw new Error(modelosError.message);
    }

    let modeloEncontrado =
      (modelos || []).find(
        item =>
          normalizeText(item.modelo) ===
          normalizeText(modelo)
      );

    let modeloId;
    let modeloGuardado;
    let categoriaGuardada;

    if (modeloEncontrado) {
      modeloId = Number(modeloEncontrado.id);
      modeloGuardado = modeloEncontrado.modelo;

      /*
       * Si estamos agregando colores/fotos a
       * un modelo existente, mantenemos también
       * actualizada su categoría.
       */
      if (
        normalizeText(modeloEncontrado.categoria) !==
        normalizeText(categoria)
      ) {
        const { data: modeloActualizado, error: updateError } =
          await supabase
            .from("modelos")
            .update({
              categoria: categoria
            })
            .eq("id", modeloId)
            .select("id, modelo, categoria")
            .single();

        if (updateError) {
          throw new Error(
            "No se pudo actualizar la categoría del modelo: " +
            updateError.message
          );
        }

        modeloGuardado = modeloActualizado.modelo;
        categoriaGuardada = modeloActualizado.categoria;
      } else {
        categoriaGuardada = modeloEncontrado.categoria;
      }

    } else {
      const { data: nuevoModelo, error } =
        await supabase
          .from("modelos")
          .insert({
            modelo: modelo,
            categoria: categoria,
            activo: true
          })
          .select("id, modelo, categoria")
          .single();

      if (error) {
        throw new Error(error.message);
      }

      modeloId = Number(nuevoModelo.id);
      modeloGuardado = nuevoModelo.modelo;
      categoriaGuardada = nuevoModelo.categoria;
    }

    /*
     * ============================
     * BUSCAR O CREAR COLOR
     * ============================
     */

    const { data: variantes, error: variantesError } =
      await supabase
        .from("variantes")
        .select("id, modelo_id, color")
        .eq("modelo_id", modeloId);

    if (variantesError) {
      throw new Error(variantesError.message);
    }

    let varianteEncontrada =
      (variantes || []).find(
        item =>
          normalizeText(item.color) ===
          normalizeText(color)
      );

    let varianteId;
    let colorGuardado;

    if (varianteEncontrada) {
      varianteId =
        Number(varianteEncontrada.id);

      colorGuardado =
        varianteEncontrada.color;

    } else {
      const { data: nuevaVariante, error } =
        await supabase
          .from("variantes")
          .insert({
            modelo_id: modeloId,
            color: color,
            activo: true
          })
          .select("id, color")
          .single();

      if (error) {
        throw new Error(error.message);
      }

      varianteId =
        Number(nuevaVariante.id);

      colorGuardado =
        nuevaVariante.color;
    }

    /*
     * ============================
     * OBTENER ÚLTIMO ORDEN
     * ============================
     */

    const { data: imagenesActuales, error: ordenError } =
      await supabase
        .from("imagenes")
        .select("id, orden")
        .eq("variante_id", varianteId)
        .order("orden", {
          ascending: false
        })
        .limit(1);

    if (ordenError) {
      throw new Error(ordenError.message);
    }

    let siguienteOrden = 1;

    if (
      imagenesActuales &&
      imagenesActuales.length
    ) {
      siguienteOrden =
        Number(
          imagenesActuales[0].orden || 0
        ) + 1;
    }

    /*
     * ============================
     * SUBIR FOTOGRAFÍAS
     * ============================
     */

    const uploaded = [];

    for (
      let i = 0;
      i < imagenes.length;
      i++
    ) {
      const imagen = imagenes[i];

      if (!imagen || !imagen.data) {
        throw new Error(
          "Una fotografía no contiene datos válidos."
        );
      }

      const originalName =
        String(
          imagen.name ||
          `imagen-${i + 1}.jpg`
        );

      const contentType =
        String(
          imagen.type ||
          "image/jpeg"
        );

      const extension =
        getExtension(
          originalName,
          contentType
        );

      const safeModelo =
        safePath(modeloGuardado);

      const safeColor =
        safePath(colorGuardado);

      const uniqueName =
        Date.now() +
        "-" +
        Math.random()
          .toString(36)
          .substring(2, 10) +
        "." +
        extension;

      const storagePath =
        `${safeModelo}/${safeColor}/${uniqueName}`;

      const buffer =
        Buffer.from(
          imagen.data,
          "base64"
        );

      /*
       * SUBIR A STORAGE
       */

      const { error: uploadError } =
        await supabase.storage
          .from("Productos")
          .upload(
            storagePath,
            buffer,
            {
              contentType,
              upsert: false
            }
          );

      if (uploadError) {
        throw new Error(
          "Error subiendo " +
          originalName +
          ": " +
          uploadError.message
        );
      }

      /*
       * OBTENER URL PÚBLICA
       */

      const { data: publicData } =
        supabase.storage
          .from("Productos")
          .getPublicUrl(storagePath);

      const publicUrl =
        publicData &&
        publicData.publicUrl;

      if (!publicUrl) {
        await supabase.storage
          .from("Productos")
          .remove([storagePath]);

        throw new Error(
          "No se pudo obtener la URL pública."
        );
      }

      /*
       * GUARDAR EN BASE DE DATOS
       */

      const { data: insertedImage, error: insertError } =
        await supabase
          .from("imagenes")
          .insert({
            variante_id: varianteId,
            url: publicUrl,
            orden: siguienteOrden
          })
          .select("id, variante_id, url, orden")
          .single();

      /*
       * SI FALLA LA BD,
       * BORRAMOS STORAGE
       */

      if (insertError) {
        await supabase.storage
          .from("Productos")
          .remove([storagePath]);

        throw new Error(
          "La fotografía se subió pero no pudo registrarse: " +
          insertError.message
        );
      }

      uploaded.push(insertedImage);

      siguienteOrden++;
    }

    /*
     * ============================
     * VERIFICACIÓN FINAL
     * ============================
     */

    const { data: verificacion, error: verifyError } =
      await supabase
        .from("imagenes")
        .select("id, variante_id, url, orden")
        .eq("variante_id", varianteId)
        .order("orden", {
          ascending: true
        });

    if (verifyError) {
      throw new Error(
        verifyError.message
      );
    }

    return respond(200, {
      success: true,
      modelo: modeloGuardado,
      categoria: categoriaGuardada,
      color: colorGuardado,
      modelo_id: modeloId,
      variante_id: varianteId,
      subidas: uploaded.length,
      total_fotografias:
        verificacion.length,
      imagenes: verificacion
    });

  } catch (error) {
    console.error(
      "ADMIN UPLOAD ERROR:",
      error
    );

    return respond(500, {
      success: false,
      error:
        error && error.message
          ? error.message
          : String(error)
    });
  }
};


/*
 * ===================================
 * CATEGORÍA
 * ===================================
 */

function cleanCategory(value) {
  const normalized =
    normalizeText(value);

  const categories = {
    "bota": "Bota",
    "botin": "Botín",
    "mocasin": "Mocasín",
    "escolar": "Escolar",
    "zapatilla": "Zapatilla"
  };

  return categories[normalized] || "";
}


/*
 * ===================================
 * NORMALIZACIÓN
 * ===================================
 *
 * Coñac = conac = COÑAC = CONAC
 * Café  = cafe
 * Negro = NEGRO
 * Shedrón = shedron
 */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


/*
 * ===================================
 * NOMBRE SEGURO PARA STORAGE
 * ===================================
 */

function safePath(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") ||
    "sin-nombre";
}


/*
 * ===================================
 * EXTENSIÓN
 * ===================================
 */

function getExtension(
  filename,
  contentType
) {
  const clean =
    String(filename || "")
      .split("?")[0];

  const parts =
    clean.split(".");

  if (parts.length > 1) {
    const ext =
      parts.pop()
        .toLowerCase()
        .replace(
          /[^a-z0-9]/g,
          ""
        );

    if (ext) {
      return ext === "jpeg"
        ? "jpg"
        : ext;
    }
  }

  if (
    contentType.includes("png")
  ) {
    return "png";
  }

  if (
    contentType.includes("webp")
  ) {
    return "webp";
  }

  return "jpg";
}
