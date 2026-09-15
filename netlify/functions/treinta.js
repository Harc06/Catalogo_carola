exports.handler = async function () {
  try {
    const catalogUrl =
      "https://catalogo.treinta.co/carola-2b7ca0";

    const storeId =
      "312b3bda-3178-5a1c-9f03-5d7a9558176e";

    const nextAction =
      "40bb5b0ade1fd3be32128e7b8b012934e5391db5b1";

    const routerState =
      "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22storeSlug%22%2C%22carola-2b7ca0%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(shop)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%2C%22modal%22%3A%5B%22__DEFAULT__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D";

    const limit = 12;
    const allProducts = [];

    // Máximo de páginas como protección.
    const maxPages = 100;

    for (let page = 1; page <= maxPages; page++) {

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
        `${catalogUrl}?sort=name-asc`,
        {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/x-component",
            "Content-Type": "text/plain;charset=UTF-8",
            "next-action": nextAction,
            "next-router-state-tree": routerState
          },
          body: body
        }
      );

      if (!response.ok) {
        throw new Error(
          `Treinta respondió HTTP ${response.status} en página ${page}`
        );
      }

      const text = await response.text();

      /*
       * Treinta responde usando el formato de
       * React Server Components.
       *
       * Dentro de la respuesta existe una línea como:
       *
       * 1:{"data":[...],"total":46,...}
       *
       * Extraemos ese JSON.
       */

      const lines = text.split("\n");

      let result = null;

      for (const line of lines) {
        const colonIndex = line.indexOf(":");

        if (colonIndex === -1) {
          continue;
        }

        const possibleJson =
          line.slice(colonIndex + 1);

        try {
          const parsed =
            JSON.parse(possibleJson);

          if (
            parsed &&
            Array.isArray(parsed.data)
          ) {
            result = parsed;
            break;
          }
        } catch (error) {
          // Esta línea no contiene el JSON
          // de productos. Continuamos.
        }
      }

      if (!result) {
        throw new Error(
          `No se pudieron interpretar los productos de la página ${page}`
        );
      }

      const products =
        result.data || [];

      /*
       * Si ya no hay productos,
       * terminamos.
       */
      if (products.length === 0) {
        break;
      }

      /*
       * Guardamos únicamente la información
       * que nuestro catálogo necesita.
       *
       * NO guardamos ni devolvemos precios.
       * Las imágenes vienen de Supabase.
       */
      for (const product of products) {

        if (!product.name) {
          continue;
        }

        if (
          product.isVisible !== 1 ||
          Number(product.stock) <= 0
        ) {
          continue;
        }

        const alreadyExists =
          allProducts.some(
            existing =>
              existing.id === product.id
          );

        if (!alreadyExists) {
          allProducts.push({
            id: product.id,
            name: String(product.name).trim(),
            stock: Number(product.stock)
          });
        }
      }

      /*
       * Treinta nos dice directamente
       * si existe otra página.
       */
      if (result.hasNextPage === false) {
        break;
      }
    }

    return {
      statusCode: 200,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Access-Control-Allow-Origin":
          "*",

        "Cache-Control":
          "no-store"
      },

      body: JSON.stringify({
        success: true,
        count: allProducts.length,
        products: allProducts
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
          "*"
      },

      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
