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

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return response(405, {
      success: false,
      error: "Método no permitido"
    });
  }

  const adminPassword =
    process.env.ADMIN_PASSWORD;

  const providedPassword =
    event.headers["x-admin-password"] ||
    event.headers["X-Admin-Password"];

  if (
    !adminPassword ||
    providedPassword !== adminPassword
  ) {
    return response(401, {
      success: false,
      error: "Acceso no autorizado"
    });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return response(500, {
      success: false,
      error: "Faltan variables de Supabase."
    });
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

    const body =
      JSON.parse(event.body || "{}");

    const action =
      String(body.action || "");

    /*
     * ELIMINAR FOTO
     */

    if (action === "delete-image") {

      const imageId =
        Number(body.imageId);

      if (!imageId) {
        throw new Error(
          "Falta el ID de la fotografía."
        );
      }

      const { data: image, error } =
        await supabase
          .from("imagenes")
          .select(
            "id, variante_id, url, orden"
          )
          .eq("id", imageId)
          .single();

      if (error || !image) {
        throw new Error(
          "No se encontró la fotografía."
        );
      }

      await removeStorageFile(
        supabase,
        image.url
      );

      const { error: deleteError } =
        await supabase
          .from("imagenes")
          .delete()
          .eq("id", imageId);

      if (deleteError) {
        throw new Error(
          "No se pudo eliminar la fotografía: " +
          deleteError.message
        );
      }

      await normalizeOrders(
        supabase,
        image.variante_id
      );

      return response(200, {
        success: true
      });
    }


    /*
     * MOVER FOTO
     */

    if (action === "move-image") {

      const imageId =
        Number(body.imageId);

      const direction =
        String(body.direction || "");

      if (
        !imageId ||
        !["left", "right"].includes(direction)
      ) {
        throw new Error(
          "Movimiento no válido."
        );
      }

      const { data: image, error } =
        await supabase
          .from("imagenes")
          .select(
            "id, variante_id, orden"
          )
          .eq("id", imageId)
          .single();

      if (error || !image) {
        throw new Error(
          "No se encontró la fotografía."
        );
      }

      const { data: images, error: listError } =
        await supabase
          .from("imagenes")
          .select("id, orden")
          .eq(
            "variante_id",
            image.variante_id
          )
          .order(
            "orden",
            { ascending: true }
          )
          .order(
            "id",
            { ascending: true }
          );

      if (listError) {
        throw new Error(
          listError.message
        );
      }

      const index =
        images.findIndex(
          item =>
            Number(item.id) === imageId
        );

      if (index === -1) {
        throw new Error(
          "No se encontró la posición."
        );
      }

      const targetIndex =
        direction === "left"
          ? index - 1
          : index + 1;

      if (
        targetIndex < 0 ||
        targetIndex >= images.length
      ) {
        return response(200, {
          success: true
        });
      }

      const target =
        images[targetIndex];

      /*
       * Usamos un orden temporal para
       * intercambiar sin conflictos.
       */

      const temporaryOrder =
        -1000000 - imageId;

      let update =
        await supabase
          .from("imagenes")
          .update({
            orden: temporaryOrder
          })
          .eq("id", image.id);

      if (update.error) {
        throw new Error(
          update.error.message
        );
      }

      update =
        await supabase
          .from("imagenes")
          .update({
            orden: image.orden
          })
          .eq("id", target.id);

      if (update.error) {
        throw new Error(
          update.error.message
        );
      }

      update =
        await supabase
          .from("imagenes")
          .update({
            orden: target.orden
          })
          .eq("id", image.id);

      if (update.error) {
        throw new Error(
          update.error.message
        );
      }

      await normalizeOrders(
        supabase,
        image.variante_id
      );

      return response(200, {
        success: true
      });
    }


    /*
     * PONER COMO PRINCIPAL
     */

    if (action === "make-primary") {

      const imageId =
        Number(body.imageId);

      if (!imageId) {
        throw new Error(
          "Falta la fotografía."
        );
      }

      const { data: image, error } =
        await supabase
          .from("imagenes")
          .select(
            "id, variante_id"
          )
          .eq("id", imageId)
          .single();

      if (error || !image) {
        throw new Error(
          "No se encontró la fotografía."
        );
      }

      const { data: images, error: listError } =
        await supabase
          .from("imagenes")
          .select("id, orden")
          .eq(
            "variante_id",
            image.variante_id
          )
          .order(
            "orden",
            { ascending: true }
          )
          .order(
            "id",
            { ascending: true }
          );

      if (listError) {
        throw new Error(
          listError.message
        );
      }

      const ordered = [
        imageId,
        ...images
          .map(item => Number(item.id))
          .filter(id => id !== imageId)
      ];

      await setOrders(
        supabase,
        ordered
      );

      return response(200, {
        success: true
      });
    }


    /*
     * ELIMINAR COLOR
     */

    if (action === "delete-variant") {

      const variantId =
        Number(body.variantId);

      if (!variantId) {
        throw new Error(
          "Falta el color."
        );
      }

      const { data: variant, error } =
        await supabase
          .from("variantes")
          .select(
            "id, modelo_id, color"
          )
          .eq("id", variantId)
          .single();

      if (error || !variant) {
        throw new Error(
          "No se encontró el color."
        );
      }

      const { data: images, error: imageError } =
        await supabase
          .from("imagenes")
          .select("id, url")
          .eq(
            "variante_id",
            variantId
          );

      if (imageError) {
        throw new Error(
          imageError.message
        );
      }

      for (const image of images || []) {
        await removeStorageFile(
          supabase,
          image.url
        );
      }

      const { error: deleteImagesError } =
        await supabase
          .from("imagenes")
          .delete()
          .eq(
            "variante_id",
            variantId
          );

      if (deleteImagesError) {
        throw new Error(
          deleteImagesError.message
        );
      }

      const { error: deleteVariantError } =
        await supabase
          .from("variantes")
          .delete()
          .eq("id", variantId);

      if (deleteVariantError) {
        throw new Error(
          deleteVariantError.message
        );
      }

      return response(200, {
        success: true
      });
    }


    /*
     * ELIMINAR MODELO COMPLETO
     */

    if (action === "delete-model") {

      const modelId =
        Number(body.modelId);

      if (!modelId) {
        throw new Error(
          "Falta el modelo."
        );
      }

      const { data: model, error } =
        await supabase
          .from("modelos")
          .select("id, modelo")
          .eq("id", modelId)
          .single();

      if (error || !model) {
        throw new Error(
          "No se encontró el modelo."
        );
      }

      const { data: variants, error: variantError } =
        await supabase
          .from("variantes")
          .select("id")
          .eq(
            "modelo_id",
            modelId
          );

      if (variantError) {
        throw new Error(
          variantError.message
        );
      }

      const variantIds =
        (variants || []).map(
          item => item.id
        );

      if (variantIds.length > 0) {

        const { data: images, error: imageError } =
          await supabase
            .from("imagenes")
            .select("id, url")
            .in(
              "variante_id",
              variantIds
            );

        if (imageError) {
          throw new Error(
            imageError.message
          );
        }

        for (const image of images || []) {
          await removeStorageFile(
            supabase,
            image.url
          );
        }

        const { error: deleteImagesError } =
          await supabase
            .from("imagenes")
            .delete()
            .in(
              "variante_id",
              variantIds
            );

        if (deleteImagesError) {
          throw new Error(
            deleteImagesError.message
          );
        }

        const { error: deleteVariantsError } =
          await supabase
            .from("variantes")
            .delete()
            .eq(
              "modelo_id",
              modelId
            );

        if (deleteVariantsError) {
          throw new Error(
            deleteVariantsError.message
          );
        }
      }

      const { error: deleteModelError } =
        await supabase
          .from("modelos")
          .delete()
          .eq("id", modelId);

      if (deleteModelError) {
        throw new Error(
          deleteModelError.message
        );
      }

      return response(200, {
        success: true
      });
    }


    throw new Error(
      "Acción no reconocida."
    );


  } catch (error) {

    console.error(
      "ADMIN MANAGE ERROR:",
      error
    );

    return response(500, {
      success: false,
      error:
        error && error.message
          ? error.message
          : String(error)
    });
  }


  /*
   * RESPUESTA
   */

  function response(statusCode, data) {
    return {
      statusCode,
      headers,
      body: JSON.stringify(data)
    };
  }
};


/*
 * NORMALIZAR ORDEN
 */

async function normalizeOrders(
  supabase,
  variantId
) {

  const { data, error } =
    await supabase
      .from("imagenes")
      .select("id, orden")
      .eq(
        "variante_id",
        variantId
      )
      .order(
        "orden",
        { ascending: true }
      )
      .order(
        "id",
        { ascending: true }
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  await setOrders(
    supabase,
    (data || []).map(
      item => Number(item.id)
    )
  );
}


/*
 * ASIGNAR ÓRDENES
 */

async function setOrders(
  supabase,
  imageIds
) {

  /*
   * Primero ponemos órdenes
   * temporales negativos.
   */

  for (
    let i = 0;
    i < imageIds.length;
    i++
  ) {

    const { error } =
      await supabase
        .from("imagenes")
        .update({
          orden: -100000 - i
        })
        .eq(
          "id",
          imageIds[i]
        );

    if (error) {
      throw new Error(
        error.message
      );
    }
  }

  /*
   * Después 1, 2, 3...
   */

  for (
    let i = 0;
    i < imageIds.length;
    i++
  ) {

    const { error } =
      await supabase
        .from("imagenes")
        .update({
          orden: i + 1
        })
        .eq(
          "id",
          imageIds[i]
        );

    if (error) {
      throw new Error(
        error.message
      );
    }
  }
}


/*
 * BORRAR ARCHIVO DE STORAGE
 */

async function removeStorageFile(
  supabase,
  publicUrl
) {

  if (!publicUrl) {
    return;
  }

  try {

    const marker =
      "/storage/v1/object/public/Productos/";

    const position =
      publicUrl.indexOf(marker);

    if (position === -1) {
      return;
    }

    let path =
      publicUrl.substring(
        position + marker.length
      );

    path =
      path.split("?")[0];

    path =
      decodeURIComponent(path);

    const { error } =
      await supabase.storage
        .from("Productos")
        .remove([path]);

    if (error) {
      throw new Error(
        "No se pudo borrar el archivo de Storage: " +
        error.message
      );
    }

  } catch (error) {

    console.error(
      "STORAGE DELETE ERROR:",
      error
    );

    throw error;
  }
}
