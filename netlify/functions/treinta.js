exports.handler = async function () {
  try {
    const url = "https://catalogo.treinta.co/carola-2b7ca0";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();

    const products = [];

    const regex =
      /href="([^"]*\/product\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

    let match;

    while ((match = regex.exec(html)) !== null) {
      const href = match[1];

      const text = match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const priceMatch = text.match(/\$[\d,.]+/);

      if (!priceMatch) continue;

      const price = priceMatch[0];

      const name = text
        .replace(price, "")
        .trim();

      if (!name) continue;

      const fullUrl = href.startsWith("http")
        ? href
        : `https://catalogo.treinta.co${href}`;

      if (
        !products.some(
          product => product.url === fullUrl
        )
      ) {
        products.push({
          name,
          price,
          url: fullUrl
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
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
