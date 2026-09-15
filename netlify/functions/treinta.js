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
        headers: {
  "User-Agent": "Mozilla/5.0",
  "Accept": "text/x-component",
  "Content-Type": "text/plain;charset=UTF-8",
  "next-action": nextAction,
  "next-router-state-tree":
    "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22storeSlug%22%2C%22carola-2b7ca0%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(shop)%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%2C%22modal%22%3A%5B%22__DEFAULT__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D"
},erBy: "name-asc",
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
