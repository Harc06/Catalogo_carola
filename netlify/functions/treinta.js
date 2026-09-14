exports.handler = async function () {
  try {
    const catalogUrl = "https://catalogo.treinta.co/carola-2b7ca0";

    const response = await fetch(catalogUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();

    const basicProducts = [];

    const regex =
      /href="([^"]*\/product\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

    let match;

    while ((match = regex.exec(html)) !== null) {
      const href = match[1];

      const text = match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // El precio se usa únicamente para limpiar el nombre,
      // pero NO se guarda ni se devuelve.
      const priceMatch = text.match(/\$[\d,.]+/);

      if (!priceMatch) continue;

      const name = text
        .replace(priceMatch[0], "")
        .trim();

      if (!name) continue;

      const fullUrl = href.startsWith("http")
        ? href
        : `https://catalogo.treinta.co${href}`;

      if (
        !basicProducts.some(
          product => product.url === fullUrl
        )
      ) {
        basicProducts.push({
          name,
          url: fullUrl
        });
      }
    }

    const products = [];

    for (const product of basicProducts) {
      try {
        const productResponse = await fetch(product.url, {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        });

        const productHtml = await productResponse.text();

        let image = null;

        const ogImageMatch = productHtml.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
        );

        if (ogImageMatch) {
          image = ogImageMatch[1];
        }

        if (!image) {
          const imageMatch = productHtml.match(
            /<img[^>]+src=["']([^"']+)["']/i
          );

          if (imageMatch) {
            image = imageMatch[1];
          }
        }

        products.push({
          name: product.name,
          image,
          url: product.url
        });

      } catch (error) {
        products.push({
          name: product.name,
          image: null,
          url: product.url
        });
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        success: true,
        count: products.length,
        products
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
