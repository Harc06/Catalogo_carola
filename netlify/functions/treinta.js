exports.handler = async function () {
  try {
    const baseUrl =
      "https://catalogo.treinta.co/carola-2b7ca0";

    const productsMap = new Map();

    /*
     * Treinta muestra 12 productos por página.
     * Revisamos hasta 20 páginas como protección.
     */
    const maxPages = 20;

    for (let page = 1; page <= maxPages; page++) {

      const url =
        baseUrl +
        "?sort=name-asc&page=" +
        page;

      const response = await fetch(url, {
        method: "GET",

        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/140.0.0.0 Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "es-MX,es;q=0.9,en;q=0.8"
        }
      });

      if (!response.ok) {
        /*
         * Si una página posterior no existe,
         * simplemente terminamos.
         */
        if (page > 1) {
          break;
        }

        throw new Error(
          "Treinta respondió HTTP " +
          response.status
        );
      }

      const html = await response.text();

      const beforeCount =
        productsMap.size;

      /*
       * Buscamos enlaces de producto:
       *
       * /carola-2b7ca0/product/UUID
       */
      const regex =
        /<a[^>]+href=["']([^"']*\/product\/([a-f0-9-]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

      let match;

      while ((match = regex.exec(html)) !== null) {

        const id =
          String(match[2] || "").trim();

        let content =
          String(match[3] || "");

        if (!id) {
          continue;
        }

        /*
         * Quitamos scripts, estilos y HTML.
         */
        content = content
          .replace(
            /<script[\s\S]*?<\/script>/gi,
            " "
          )
          .replace(
            /<style[\s\S]*?<\/style>/gi,
            " "
          )
          .replace(
            /<[^>]+>/g,
            " "
          )
          .replace(
            /&nbsp;/gi,
            " "
          )
          .replace(
            /&amp;/gi,
            "&"
          )
          .replace(
            /&quot;/gi,
            '"'
          )
          .replace(
            /&#39;/gi,
            "'"
          )
          .replace(
            /\s+/g,
            " "
          )
          .trim();

        if (!content) {
          continue;
        }

        /*
         * Quitamos precio y cualquier texto
         * posterior al signo $.
         *
         * CAROLA nunca muestra precios.
         */
        let name =
          content
            .replace(
              /\$\s*[\d.,]+[\s\S]*$/i,
              ""
            )
            .trim();

        if (!name) {
          continue;
        }

        if (name.length > 120) {
          continue;
        }

        if (
          /^(agregar|buscar|ver todos)$/i
            .test(name)
        ) {
          continue;
        }

        if (!productsMap.has(id)) {
          productsMap.set(id, {
            id: id,
            name: name,
            stock: 1
          });
        }
      }

      /*
       * Si no encontramos productos mediante
       * enlaces, intentamos leer los datos
       * serializados de Next.js.
       */
      if (productsMap.size === beforeCount) {

        const serializedRegex =
          /"id"\s*:\s*"([a-f0-9-]{20,})"[\s\S]{0,1800}?"name"\s*:\s*"([^"]+)"/gi;

        while (
          (match = serializedRegex.exec(html)) !== null
        ) {

          const id =
            String(match[1] || "").trim();

          const name =
            decodeJsonText(
              match[2] || ""
            ).trim();

          if (
            !id ||
            !name ||
            name.length > 120
          ) {
            continue;
          }

          if (!productsMap.has(id)) {
            productsMap.set(id, {
              id: id,
              name: name,
              stock: 1
            });
          }
        }
      }

      /*
       * Si esta página no agregó ningún producto,
       * ya llegamos al final.
       */
      if (
        productsMap.size === beforeCount
      ) {
        break;
      }
    }

    const products =
      Array.from(productsMap.values());

    if (!products.length) {
      throw new Error(
        "Treinta respondió correctamente, pero no se encontraron productos."
      );
    }

    /*
     * Orden natural.
     *
     * 117
     * 302
     * 519
     * 9004
     * etc.
     */
    products.sort(function (a, b) {

      return String(a.name)
        .localeCompare(
          String(b.name),
          "es",
          {
            numeric: true,
            sensitivity: "base"
          }
        );

    });

    return {
      statusCode: 200,

      headers: {

        "Content-Type":
          "application/json; charset=utf-8",

        "Access-Control-Allow-Origin":
          "*",

        /*
         * Actualización frecuente.
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
          error && error.message
            ? error.message
            : "Error desconocido consultando Treinta"
      })
    };
  }
};


/* =========================
   DECODIFICAR TEXTO
========================= */

function decodeJsonText(value) {

  try {

    return JSON.parse(
      '"' +
      String(value)
        .replace(/"/g, '\\"') +
      '"'
    );

  } catch (error) {

    return String(value || "");

  }
}
