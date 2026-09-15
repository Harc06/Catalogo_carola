exports.handler = async function () {
  try {
    const catalogUrl =
      "https://catalogo.treinta.co/carola-2b7ca0";

    const storeId =
      "312b3bda-3178-5a1c-9f03-5d7a9558176e";

    const nextAction =
      "40bb5b0ade1fd3be32128e7b8b012934e5391db5b1";

    const body = JSON.stringify([
      {
        storeId,
        page: 2,
        limit: 12,
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

    const text = await response.text();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      },
      body:
        `HTTP TREINTA: ${response.status}\n\n` +
        text
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      },
      body: `ERROR: ${error.message}`
    };
  }
};
