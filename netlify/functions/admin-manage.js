const {authorized}=require("./admin-auth-lib");
const { createClient } = require("@supabase/supabase-js");

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-password, Authorization",
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

  if(!(await authorized(event))){return respond(401,{success:false,error:"Acceso no autorizado"});}

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
    const action = String(body.action || "");

    /*
     * =========================
     * EDITAR MODELO
     * =========================
     */

    if (action === "rename-model") {
      const modelId = Number(body.modelId);
      const newName = String(body.newName || "").trim();

      if (!modelId || !newName) {
        throw new Error(
          "Modelo o nombre nuevo inválido."
        );
      }

      const { data: modelos, error } =
        await supabase
          .from("modelos")
          .select("id, modelo");

      if (error) {
        throw new Error(error.message);
      }

      const duplicate =
        (modelos || []).find(
          item =>
            Number(item.id) !== modelId &&
            normalizeText(item.modelo) ===
              normalizeText(newName)
        );

      if (duplicate) {
        throw new Error(
          "Ya existe el modelo " +
          duplicate.modelo +
          "."
        );
      }

      const { error: updateError } =
        await supabase
          .from("modelos")
          .update({
            modelo: newName
          })
          .eq("id", modelId);

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      return respond(200, {
        success: true
      });
    }


    /*
     * =========================
     * EDITAR CATEGORÍA
     * =========================
     */

    if (action === "update-category") {
      const modelId = Number(body.modelId);
      const category = cleanCategory(
        body.category
      );

      if (!modelId) {
        throw new Error(
          "Modelo inválido."
        );
      }

      if (!category) {
        throw new Error(
          "Categoría inválida. Usa Bota, Botín, Mocasín, Escolar o Zapatilla."
        );
      }

      const {
        data: updatedModel,
        error: updateError
      } =
        await supabase
          .from("modelos")
          .update({
            categoria: category
          })
          .eq("id", modelId)
          .select(
            "id, modelo, categoria"
          )
          .single();

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      return respond(200, {
        success: true,
        modelo: updatedModel
      });
    }


    /*
     * =========================
     * EDITAR COLOR
     * =========================
     */

    if (action === "rename-variant") {
      const variantId =
        Number(body.variantId);

      const newColor =
        String(
          body.newColor || ""
        ).trim();

      if (!variantId || !newColor) {
        throw new Error(
          "Color inválido."
        );
      }

      const {
        data: variant,
        error: variantError
      } =
        await supabase
          .from("variantes")
          .select(
            "id, modelo_id, color"
          )
          .eq("id", variantId)
          .single();

      if (
        variantError ||
        !variant
      ) {
        throw new Error(
          "No se encontró el color."
        );
      }

      const {
        data: variantes,
        error: listError
      } =
        await supabase
          .from("variantes")
          .select(
            "id, modelo_id, color"
          )
          .eq(
            "modelo_id",
            variant.modelo_id
          );

      if (listError) {
        throw new Error(
          listError.message
        );
      }

      const duplicate =
        (variantes || []).find(
          item =>
            Number(item.id) !== variantId &&
            normalizeText(item.color) ===
              normalizeText(newColor)
        );

      if (duplicate) {
        throw new Error(
          "Este modelo ya tiene el color " +
          duplicate.color +
          "."
        );
      }

      const {
        error: updateError
      } =
        await supabase
          .from("variantes")
          .update({
            color: newColor
          })
          .eq("id", variantId);

      if (updateError) {
        throw new Error(
          updateError.message
        );
      }

      return respond(200, {
        success: true
      });
    }


    /*
     * =========================
     * ELIMINAR FOTO
     * =========================
     */

    if (action === "delete-image") {
      const imageId =
        Number(body.imageId);

      const {
        data: image,
        error
      } =
        await supabase
          .from("imagenes")
          .select(
            "id, variante_id, url"
          )
          .eq("id", imageId)
          .single();

      if (error || !image) {
        throw new Error(
          "No se encontró la fotografía."
        );
      }

      const {
        error: deleteError
      } =
        await supabase
          .from("imagenes")
          .delete()
          .eq("id", imageId);

      if (deleteError) {
        throw new Error(
          deleteError.message
        );
      }

      await removeStorageFile(
        supabase,
        image.url
      );

      await normalizeOrders(
        supabase,
        image.variante_id
      );

      return respond(200, {
        success: true
      });
    }


    /*
     * =========================
     * MOVER FOTO
     * =========================
     */

    if (action === "move-image") {
      const imageId =
        Number(body.imageId);

      const direction =
        String(
          body.direction || ""
        );

      if (
        ![
          "left",
          "right"
        ].includes(direction)
      ) {
        throw new Error(
          "Movimiento inválido."
        );
      }

      const {
        data: image,
        error
      } =
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

      const {
        data: images,
        error: listError
      } =
        await supabase
          .from("imagenes")
          .select("id, orden")
          .eq(
            "variante_id",
            image.variante_id
          )
          .order(
            "orden",
            {
              ascending: true
            }
          )
          .order(
            "id",
            {
              ascending: true
            }
          );

      if (listError) {
        throw new Error(
          listError.message
        );
      }

      const ids =
        (images || []).map(
          item => Number(item.id)
        );

      const index =
        ids.indexOf(imageId);

      if (index === -1) {
        throw new Error(
          "No se encontró la posición."
        );
      }

      const target =
        direction === "left"
          ? index - 1
          : index + 1;

      if (
        target < 0 ||
        target >= ids.length
      ) {
        return respond(200, {
          success: true
        });
      }

      [
        ids[index],
        ids[target]
      ] = [
        ids[target],
        ids[index]
      ];

      await setOrders(
        supabase,
        ids
      );

      return respond(200, {
        success: true
      });
    }


    /*
     * =========================
     * HACER PRINCIPAL
     * =========================
     */

    if (action === "make-primary") {
      const imageId =
        Number(body.imageId);

      const {
        data: image,
        error
      } =
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

      const {
        data: images,
        error: listError
      } =
        await supabase
          .from("imagenes")
          .select("id, orden")
          .eq(
            "variante_id",
            image.variante_id
          )
          .order(
            "orden",
            {
              ascending: true
            }
          )
          .order(
            "id",
            {
              ascending: true
            }
          );

      if (listError) {
        throw new Error(
          listError.message
        );
      }

      const ids = [
        imageId,
        ...(images || [])
          .map(
            item => Number(item.id)
          )
          .filter(
            id => id !== imageId
          )
      ];

      await setOrders(
        supabase,
        ids
      );

      return respond(200, {
        success: true
      });
    }


    /*
     * =========================
     * ELIMINAR COLOR
     * =========================
     */

    if (action === "delete-variant") {
      const variantId =
        Number(body.variantId);

      if (!variantId) {
        throw new Error(
          "Color inválido."
        );
      }

      const {
        data: images,
        error: imageError
      } =
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

      const {
        error: deleteImagesError
      } =
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

      const {
        error: deleteVariantError
      } =
        await supabase
          .from("variantes")
          .delete()
          .eq(
            "id",
            variantId
          );

      if (deleteVariantError) {
        throw new Error(
          deleteVariantError.message
        );
      }

      for (
        const image of images || []
      ) {
        await removeStorageFile(
          supabase,
          image.url
        );
      }

      return respond(200, {
        success: true
      });
    }


    /*
     * =========================
     * ELIMINAR MODELO
     * =========================
     */

    if (action === "delete-model") {
      const modelId =
        Number(body.modelId);

      if (!modelId) {
        throw new Error(
          "Modelo inválido."
        );
      }

      const {
        data: variants,
        error: variantError
      } =
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
          item => Number(item.id)
        );

      let images = [];

      if (variantIds.length) {
        const result =
          await supabase
            .from("imagenes")
            .select("id, url")
            .in(
              "variante_id",
              variantIds
            );

        if (result.error) {
          throw new Error(
            result.error.message
          );
        }

        images =
          result.data || [];

        const {
          error: deleteImagesError
        } =
          await supabase
            .from("imagenes")
            .delete()
            .in(
              "variante_id",
              variantIds
            );

        if (
          deleteImagesError
        ) {
          throw new Error(
            deleteImagesError.message
          );
        }

        const {
          error: deleteVariantsError
        } =
          await supabase
            .from("variantes")
            .delete()
            .eq(
              "modelo_id",
              modelId
            );

        if (
          deleteVariantsError
        ) {
          throw new Error(
            deleteVariantsError.message
          );
        }
      }

      const {
        error: deleteModelError
      } =
        await supabase
          .from("modelos")
          .delete()
          .eq(
            "id",
            modelId
          );

      if (deleteModelError) {
        throw new Error(
          deleteModelError.message
        );
      }

      for (
        const image of images
      ) {
        await removeStorageFile(
          supabase,
          image.url
        );
      }

      return respond(200, {
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
 * NORMALIZAR TEXTO
 * ===================================
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
 * NORMALIZAR ORDEN
 * ===================================
 */

async function normalizeOrders(
  supabase,
  variantId
) {
  const {
    data,
    error
  } =
    await supabase
      .from("imagenes")
      .select("id, orden")
      .eq(
        "variante_id",
        variantId
      )
      .order(
        "orden",
        {
          ascending: true
        }
      )
      .order(
        "id",
        {
          ascending: true
        }
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
 * ===================================
 * ESTABLECER ORDEN
 * ===================================
 */

async function setOrders(
  supabase,
  ids
) {
  /*
   * Primero usamos valores temporales.
   */

  for (
    let i = 0;
    i < ids.length;
    i++
  ) {
    const { error } =
      await supabase
        .from("imagenes")
        .update({
          orden:
            -100000 - i
        })
        .eq(
          "id",
          ids[i]
        );

    if (error) {
      throw new Error(
        error.message
      );
    }
  }

  /*
   * Después establecemos 1,2,3...
   */

  for (
    let i = 0;
    i < ids.length;
    i++
  ) {
    const { error } =
      await supabase
        .from("imagenes")
        .update({
          orden:
            i + 1
        })
        .eq(
          "id",
          ids[i]
        );

    if (error) {
      throw new Error(
        error.message
      );
    }
  }
}


/*
 * ===================================
 * BORRAR ARCHIVO DE STORAGE
 * ===================================
 */

async function removeStorageFile(
  supabase,
  publicUrl
) {
  if (!publicUrl) {
    return;
  }

  const marker =
    "/storage/v1/object/public/Productos/";

  const position =
    publicUrl.indexOf(
      marker
    );

  if (position === -1) {
    return;
  }

  let path =
    publicUrl.substring(
      position +
      marker.length
    );

  path =
    decodeURIComponent(
      path.split("?")[0]
    );

  const { error } =
    await supabase.storage
      .from("Productos")
      .remove([path]);

  /*
   * Si falla Storage no dejamos
   * inconsistente la base de datos.
   */

  if (error) {
    console.error(
      "No se pudo limpiar Storage:",
      error.message
    );
  }
}
