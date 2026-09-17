exports.handler = async function () {
  try {
    const catalogUrl =
      "https://catalogo.treinta.co/carola-2b7ca0";

    const storeId =
      "312b3bda-3178-5a1c-9f03-5d7a9558176e";

    /*
     * Acción actual de Treinta.
     * Capturada directamente de la petición
     * que realiza el catálogo al hacer scroll.
     */
    const nextAction =
      "40543b8e804fdd9172d01b3e67327009946c1bac87";

    /*
     * Estado del router de Next.js.
     */
    const routerState =
      "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22storeSlug%22%2C%22carola-2b7ca0%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(shop)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%2C%22modal%22%3A%5B%22__DEFAULT__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";

    const limit = 12;

    const allProducts = new Map();

    /*
     * Protección para evitar loops infinitos.
     * Tu catálogo actualmente termina alrededor
     * de la página 5.
     */
    const maxPages = 20;

    for (
      let page = 1;
      page <= maxPages;
      page++
    ) {
      const body = JSON.stringify([
        {
          storeId: storeId,
          page: page,
          limit: limit,
          category: "$undefined",
          search: "$undefined",
          orderBy: "name-asc",
          excludeOutOfStock: true
        }
      ]);

      const response = await fetch(
        catalogUrl + "?sort=name-asc",
        {
          method: "POST",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
              "AppleWebKit/537.36 (KHTML, like Gecko) " +
              "Chrome/140.0.0.0 Safari/537.36",

            "Accept":
              "text/x-component",

            "Content-Type":
              "text/plain;charset=UTF-8",

            "next-action":
              nextAction,

            "next-router-state-tree":
              routerState,

            "Origin":
              "https://catalogo.treinta.co",

            "Referer":
              catalogUrl + "?sort=name-asc"
          },

          body: body
        }
      );

      if (!response.ok) {
        throw new Error(
          "Treinta respondió HTTP " +
          response.status +
          " en página " +
          page
        );
      }

      const text =
        await response.text();

      /*
       * Las Server Actions de Next.js devuelven
       * varias líneas RSC.
       *
       * Buscamos cualquier objeto que contenga:
       *
       * data: [...]
       * page
       * limit
       * hasNextPage
       */
      const result =
        findProductResult(text);

      if (!result) {
        throw new Error(
          "No se pudieron interpretar los productos de Treinta en página " +
          page
        );
      }

      const products =
        Array.isArray(result.data)
          ? result.data
          : [];

      /*
       * Si Treinta devuelve una página vacía,
       * terminamos.
       */
      if (products.length === 0) {
        break;
      }

      for (const product of products) {
        if (
          !product ||
          !product.id ||
          !product.name
        ) {
          continue;
        }

        /*
         * Solo productos visibles.
         */
        if (
          product.isVisible !== undefined &&
          Number(product.isVisible) !== 1
        ) {
          continue;
        }

        /*
         * Solo productos con existencia.
         */
        const stock =
          Number(product.stock || 0);

        if (stock <= 0) {
          continue;
        }

        const id =
          String(product.id).trim();

        const name =
          String(product.name).trim();

        if (!id || !name) {
          continue;
        }

        /*
         * Map evita productos duplicados.
         */
        if (!allProducts.has(id)) {
          allProducts.set(id, {
            id: id,
            name: name,
            stock: stock
          });
        }
      }

      /*
       * Treinta nos indica directamente
       * cuándo llegamos a la última página.
       *
       * En tu captura:
       *
       * page: 5
       * limit: 12
       * hasNextPage: false
       */
      if (
        result.hasNextPage === false
      ) {
        break;
      }

      /*
       * Protección adicional.
       */
      if (
        products.length < limit &&
        result.hasNextPage !== true
      ) {
        break;
      }
    }

    const products =
      Array.from(
        allProducts.values()
      );

    /*
     * Orden natural:
     *
     * 117
     * 302
     * 519
     * 1310
     * ...
     */
    products.sort(
      function (a, b) {
        return String(a.name)
          .localeCompare(
            String(b.name),
            "es",
            {
              numeric: true,
              sensitivity: "base"
            }
          );
      }
    );

    if (products.length === 0) {
      throw new Error(
        "Treinta no devolvió productos disponibles."
      );
    }

    return {
      statusCode: 200,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Access-Control-Allow-Origin":
          "*",

        /*
         * Guardamos el resultado durante
         * un minuto en Netlify.
         */
        "Cache-Control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      },

      body: JSON.stringify({
        success: true,
        count: products.length,
        products: products
      })
    };

  } catch (error) {
    console.error(
      "Error sincronizando Treinta:",
      error
    );

    return {
      statusCode: 500,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Access-Control-Allow-Origin":
          "*",

        "Cache-Control":
          "no-store"
      },

      body: JSON.stringify({
        success: false,

        error:
          error &&
          error.message
            ? error.message
            : "Error desconocido consultando Treinta"
      })
    };
  }
};


/* =====================================================
   ENCONTRAR RESPUESTA DE PRODUCTOS DENTRO DEL RSC
===================================================== */

function findProductResult(text) {
  const lines =
    String(text || "")
      .split("\n");

  /*
   * Primer intento:
   * cada línea RSC puede contener un JSON.
   */
  for (const line of lines) {
    const colonIndex =
      line.indexOf(":");

    if (colonIndex === -1) {
      continue;
    }

    const possibleJson =
      line
        .slice(colonIndex + 1)
        .trim();

    if (!possibleJson) {
      continue;
    }

    try {
      const parsed =
        JSON.parse(possibleJson);

      const found =
        searchObject(parsed);

      if (found) {
        return found;
      }

    } catch (error) {
      /*
       * No todas las líneas RSC son
       * JSON independiente.
       */
    }
  }

  /*
   * Segundo intento.
   *
   * Busca directamente el objeto que contiene
   * data + page + limit + hasNextPage.
   */
  const dataIndex =
    text.indexOf('"data"');

  if (dataIndex !== -1) {
    /*
     * Probamos diferentes posiciones de apertura
     * antes de "data".
     */
    for (
      let start = dataIndex;
      start >= 0;
      start--
    ) {
      if (text[start] !== "{") {
        continue;
      }

      const candidate =
        extractJsonObject(
          text,
          start
        );

      if (!candidate) {
        continue;
      }

      try {
        const parsed =
          JSON.parse(candidate);

        if (
          parsed &&
          Array.isArray(parsed.data)
        ) {
          return parsed;
        }

      } catch (error) {
        // seguimos buscando
      }
    }
  }

  return null;
}


/* =====================================================
   BUSCAR RECURSIVAMENTE DATA:[]
===================================================== */

function searchObject(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.data)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found =
        searchObject(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof value === "object"
  ) {
    for (
      const key of Object.keys(value)
    ) {
      const found =
        searchObject(
          value[key]
        );

      if (found) {
        return found;
      }
    }
  }

  return null;
}


/* =====================================================
   EXTRAER OBJETO JSON COMPLETO
===================================================== */

function extractJsonObject(
  text,
  start
) {
  let depth = 0;

  let insideString = false;

  let escaped = false;

  for (
    let i = start;
    i < text.length;
    i++
  ) {
    const char =
      text[i];

    if (insideString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        insideString = false;
      }

      continue;
    }

    if (char === '"') {
      insideString = true;
      continue;
    }

    if (char === "{") {
      depth++;
    }

    if (char === "}") {
      depth--;

      if (depth === 0) {
        return text.slice(
          start,
          i + 1
        );
      }
    }
  }

  return null;
}
