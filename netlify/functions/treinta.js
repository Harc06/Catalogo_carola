exports.handler = async function () {
  try {
    const catalogUrl =
      "https://catalogo.treinta.co/carola-2b7ca0?sort=name-asc";

    const response = await fetch(catalogUrl, {
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
      throw new Error(
        `Treinta respondió HTTP ${response.status}`
      );
    }

    const html = await response.text();

    /*
     * Buscamos los productos directamente
     * dentro del HTML público de Treinta.
     *
     * Actualmente los enlaces tienen esta forma:
     *
     * /carola-2b7ca0/product/UUID
     */

    const regex =
      /<a[^>]+href=["']([^"']*\/product\/([a-f0-9-]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const found = new Map();

    let match;

    while ((match = regex.exec(html)) !== null) {
      const id = match[2];

      const block = match[3];

      /*
       * Eliminamos etiquetas HTML.
       */
      let text = block
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) {
        continue;
      }

      /*
       * Treinta muestra normalmente algo como:
       *
       * 117 $235
       *
       * Quitamos el precio porque CAROLA
       * no muestra precios.
       */
      text = text
        .replace(/\$\s*[\d.,]+.*$/i, "")
        .trim();

      if (!text) {
        continue;
      }

      /*
       * Protección contra textos que no sean
       * nombres reales de producto.
       */
      if (
        text.length > 100 ||
        /^(agregar|buscar|ver todos)$/i.test(text)
      ) {
        continue;
      }

      if (!found.has(id)) {
        found.set(id, {
          id: id,
          name: text,

          /*
           * El catálogo público ya está mostrando
           * productos disponibles.
           *
           * Nuestro frontend únicamente necesita
           * un stock positivo para considerarlo
           * disponible.
           */
          stock: 1
        });
      }
    }

    let products = Array.from(found.values());

    /*
     * Segundo método de lectura.
     *
     * Next.js suele incluir datos serializados
     * dentro del HTML aunque la estructura visual
     * cambie.
     */
    if (products.length === 0) {
      const productPattern =
        /"id"\s*:\s*"([a-f0-9-]{20,})"[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/gi;

      while ((match = productPattern.exec(html)) !== null) {
        const id = match[1];

        const name = decodeJsonText(match[2]);

        if (
          !id ||
          !name ||
          name.length > 100
        ) {
          continue;
        }

        if (!found.has(id)) {
          found.set(id, {
            id: id,
            name: name.trim(),
            stock: 1
          });
        }
      }

      products = Array.from(found.values());
    }

    if (products.length === 0) {
      throw new Error(
        "Treinta respondió correctamente, pero no se pudieron encontrar productos."
      );
    }

    /*
     * Orden natural:
     * 117 antes de 519,
     * 519 antes de 1310, etc.
     */
    products.sort(function (a, b) {
      return String(a.name).localeCompare(
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
         * Caché corta para no consultar Treinta
         * innecesariamente en cada visita.
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
   UTILIDAD JSON
========================= */

function decodeJsonText(value) {
  try {
    return JSON.parse(
      '"' +
      String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"') +
      '"'
    );
  } catch (error) {
    return String(value || "");
  }
}
