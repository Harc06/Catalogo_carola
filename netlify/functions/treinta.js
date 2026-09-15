exports.handler = async function () {
  try {
    const catalogUrl =
      "https://catalogo.treinta.co/carola-2b7ca0";

    const storeId =
      "312b3bda-3178-5a1c-9f03-5d7a9558176e";

    const nextAction =
      "40bb5b0ade1fd3be32128e7b8b012934e5391db5b1";

    const limit = 12;
    const allProducts = [];

    // Recorremos las páginas de Treinta.
    // Dejamos un máximo de 100 como protección.
    for (let page = 1; page <= 100; page++) {
      const body = JSON.stringify([
        {
          storeId,
          page,
          limit,
          category: "undefined",
          search: "undefined",
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
            "next-action": nextAction
          },
          body
        }
      );

      if (!response.ok) {
        throw new Error(
          `Treinta respondió ${response.status} en página ${page}`
        );
      }

      const text = await response.text();

      /*
       * La respuesta de una Server Action de Next.js no es
       * JSON puro. Buscamos dentro de ella los objetos de
       * producto que contienen id, name, stock, etc.
       */
      const productRegex =
        /"id":"([^"]+)"[\s\S]*?"name":"([^"]+)"[\s\S]*?"isVisible":(\d+)[\s\S]*?"stock":(-?\d+)/g;

      const pageProducts = [];
      let match;

      while ((match = productRegex.exec(text)) !== null) {
        const id = match[1];
        const name = match[2];
        const isVisible = Number(match[3]);
        const stock = Number(match[4]);

        if (
          isVisible === 1 &&
          stock > 0 &&
          !pageProducts.some(
            product => product.id === id
          )
        ) {
          pageProducts.push({
            id,
            name,
            stock
          });
        }
      }

      // Si Treinta ya no devuelve productos,
      // terminamos la paginación.
      if (pageProducts.length === 0) {
        break;
      }

      for (const product of pageProducts) {
        if (
          !allProducts.some(
            existing => existing.id === product.id
          )
        ) {
          allProducts.push(product);
        }
      }

      // Una página incompleta normalmente indica
      // que llegamos al final.
      if (pageProducts.length < limit) {
        break;
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        success: true,
        count: allProducts.length,
        products: allProducts
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
