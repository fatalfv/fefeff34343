export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env, origin),
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/discount" && request.method === "POST") {
      return checkDiscount(request, env, origin);
    }

    if (url.pathname === "/api/health") {
      return json(
        {
          success: true,
          service: "Gilded Payment API",
        },
        200,
        env,
        origin
      );
    }

    return json(
      {
        success: false,
        error: "Not found",
      },
      404,
      env,
      origin
    );
  },
};


async function checkDiscount(request, env, origin) {
  try {
    const body = await request.json();

    const code = String(body.code || "")
      .trim()
      .toLowerCase();

    if (!code) {
      return json(
        {
          success: false,
          error: "Please enter a discount code.",
        },
        400,
        env,
        origin
      );
    }

    /*
     * ADMIN123
     *
     * 100% discount
     * Maximum 1 successful use
     */

    if (code !== "admin123") {
      return json(
        {
          success: false,
          error: "Invalid discount code.",
        },
        400,
        env,
        origin
      );
    }

    const key = "discount:admin123";

    const existing = await env.GILDED_KV.get(key);

    if (existing) {
      let data;

      try {
        data = JSON.parse(existing);
      } catch {
        data = {
          used: existing === "used",
        };
      }

      if (data.used === true) {
        return json(
          {
            success: false,
            error: "This discount code has already been used.",
          },
          400,
          env,
          origin
        );
      }
    }

    return json(
      {
        success: true,
        code: "ADMIN123",
        discountPercent: 100,
        message: "100% discount applied.",
      },
      200,
      env,
      origin
    );

  } catch (error) {
    console.error(error);

    return json(
      {
        success: false,
        error: "Unable to check discount code.",
      },
      500,
      env,
      origin
    );
  }
}


function json(data, status, env, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env, origin),
    },
  });
}


function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN;

  const allowOrigin =
    origin === allowed
      ? origin
      : allowed;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
