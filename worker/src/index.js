const PACKS = {
  "dev-locker": {
    name: "Dev Locker",
    price: 14.99,
  },

  "full-locker": {
    name: "Full Locker",
    price: 10.99,
  },
};

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

    try {
      if (
        url.pathname === "/api/discount/validate" &&
        request.method === "POST"
      ) {
        return await validateDiscount(request, env, origin);
      }

      if (
        url.pathname === "/api/order/create" &&
        request.method === "POST"
      ) {
        return await createOrder(request, env, origin);
      }

      if (
        url.pathname === "/api/order/payment" &&
        request.method === "POST"
      ) {
        return await createPayment(request, env, origin);
      }

      if (
        url.pathname === "/api/order/status" &&
        request.method === "GET"
      ) {
        return await orderStatus(request, env, origin);
      }

      if (url.pathname === "/api/health") {
        return json(
          {
            success: true,
            service: "Gilded Payment API",
            status: "online",
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
    } catch (error) {
      console.error("Worker error:", error);

      return json(
        {
          success: false,
          error: "Internal server error.",
        },
        500,
        env,
        origin
      );
    }
  },
};


/* ============================================================
   DISCOUNT VALIDATION
============================================================ */

async function validateDiscount(request, env, origin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        valid: false,
        error: "Invalid request.",
      },
      400,
      env,
      origin
    );
  }

  const code = String(body.code || "")
    .trim()
    .toLowerCase();

  const packId = String(body.packId || "");

  const pack = PACKS[packId];

  if (!pack) {
    return json(
      {
        success: false,
        valid: false,
        error: "Invalid pack.",
      },
      400,
      env,
      origin
    );
  }

  if (!code) {
    return json(
      {
        success: false,
        valid: false,
        error: "Please enter a discount code.",
      },
      400,
      env,
      origin
    );
  }

  if (code !== "admin123") {
    return json(
      {
        success: false,
        valid: false,
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
          valid: false,
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
      valid: true,
      code: "ADMIN123",
      percent: 100,
      discountAmount: Number(pack.price.toFixed(2)),
      finalPrice: 0,
      message: "100% discount applied.",
    },
    200,
    env,
    origin
  );
}


/* ============================================================
   CREATE ORDER
============================================================ */

async function createOrder(request, env, origin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid request.",
      },
      400,
      env,
      origin
    );
  }

  const packId = String(body.packId || "");
  const discordUsername = String(body.discordUsername || "").trim();
  const discordId = String(body.discordId || "").trim();
  const discountCode = String(body.discountCode || "")
    .trim()
    .toLowerCase();

  const pack = PACKS[packId];

  if (!pack) {
    return json(
      {
        success: false,
        error: "Invalid donation pack.",
      },
      400,
      env,
      origin
    );
  }

  if (!discordUsername) {
    return json(
      {
        success: false,
        error: "Discord username is required.",
      },
      400,
      env,
      origin
    );
  }

  if (!/^[0-9]{17,20}$/.test(discordId)) {
    return json(
      {
        success: false,
        error: "Invalid Discord ID.",
      },
      400,
      env,
      origin
    );
  }

  let finalPrice = pack.price;
  let discountAmount = 0;
  let discountPercent = 0;
  let usedDiscount = false;

  /*
   * Validate ADMIN123 AGAIN on the server.
   *
   * Never trust the price calculated by the frontend.
   */

  if (discountCode === "admin123") {
    const discountKey = "discount:admin123";

    const existing = await env.GILDED_KV.get(discountKey);

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

    discountPercent = 100;
    discountAmount = pack.price;
    finalPrice = 0;
    usedDiscount = true;
  } else if (discountCode) {
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

  const orderId = generateOrderId();

  const order = {
    orderId,
    packId,
    packName: pack.name,

    originalPrice: Number(pack.price.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    discountPercent,

    finalPrice: Number(finalPrice.toFixed(2)),

    discordUsername,
    discordId,

    discountCode: usedDiscount ? "ADMIN123" : "",

    status: finalPrice === 0
      ? "pending_verification"
      : "awaiting_payment",

    createdAt: new Date().toISOString(),
  };

  /*
   * Store order.
   */

  await env.GILDED_KV.put(
    `order:${orderId}`,
    JSON.stringify(order)
  );

  /*
   * If this is a free order, consume ADMIN123.
   */

  if (usedDiscount) {
    await env.GILDED_KV.put(
      "discount:admin123",
      JSON.stringify({
        used: true,
        orderId,
        usedAt: new Date().toISOString(),
      })
    );
  }

  /*
   * Discord logging.
   */

  await sendDiscordLog(env, order);

  /*
   * Free order.
   */

  if (finalPrice === 0) {
    return json(
      {
        success: true,
        orderId,
        finalPrice: 0,
        free: true,
        status: "pending_verification",
      },
      200,
      env,
      origin
    );
  }

  /*
   * Paid order.
   *
   * The frontend will now ask the Worker for
   * the configured payment URL.
   */

  return json(
    {
      success: true,
      orderId,
      finalPrice: Number(finalPrice.toFixed(2)),
      free: false,
      status: "awaiting_payment",
    },
    200,
    env,
    origin
  );
}


/* ============================================================
   PAYMENT
============================================================ */

async function createPayment(request, env, origin) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid request.",
      },
      400,
      env,
      origin
    );
  }

  const orderId = String(body.orderId || "");
  const method = String(body.method || "").toLowerCase();

  if (!orderId) {
    return json(
      {
        success: false,
        error: "Order ID is required.",
      },
      400,
      env,
      origin
    );
  }

  const stored = await env.GILDED_KV.get(
    `order:${orderId}`
  );

  if (!stored) {
    return json(
      {
        success: false,
        error: "Order not found.",
      },
      404,
      env,
      origin
    );
  }

  const order = JSON.parse(stored);

  if (order.finalPrice <= 0) {
    return json(
      {
        success: false,
        error: "This order does not require payment.",
      },
      400,
      env,
      origin
    );
  }

  if (method !== "paypal" && method !== "card") {
    return json(
      {
        success: false,
        error: "Invalid payment method.",
      },
      400,
      env,
      origin
    );
  }

  /*
   * Set these in Cloudflare Worker environment variables:
   *
   * PAYPAL_PAYMENT_URL
   * CARD_PAYMENT_URL
   *
   * You can use your actual PayPal checkout/payment URL
   * and card provider checkout URL here.
   */

  const paymentUrl =
    method === "paypal"
      ? env.PAYPAL_PAYMENT_URL
      : env.CARD_PAYMENT_URL;

  if (!paymentUrl) {
    return json(
      {
        success: false,
        error:
          `${method === "paypal" ? "PayPal" : "Card"} payment is not configured yet.`,
      },
      503,
      env,
      origin
    );
  }

  /*
   * Update order status.
   */

  order.paymentMethod = method;
  order.status = "payment_started";
  order.paymentStartedAt = new Date().toISOString();

  await env.GILDED_KV.put(
    `order:${orderId}`,
    JSON.stringify(order)
  );

  return json(
    {
      success: true,
      orderId,
      method,
      url: paymentUrl,
    },
    200,
    env,
    origin
  );
}


/* ============================================================
   ORDER STATUS
============================================================ */

async function orderStatus(request, env, origin) {
  const url = new URL(request.url);

  const orderId = url.searchParams.get("orderId");

  if (!orderId) {
    return json(
      {
        success: false,
        error: "Order ID is required.",
      },
      400,
      env,
      origin
    );
  }

  const stored = await env.GILDED_KV.get(
    `order:${orderId}`
  );

  if (!stored) {
    return json(
      {
        success: false,
        error: "Order not found.",
      },
      404,
      env,
      origin
    );
  }

  const order = JSON.parse(stored);

  return json(
    {
      success: true,
      order,
    },
    200,
    env,
    origin
  );
}


/* ============================================================
   DISCORD WEBHOOK
============================================================ */

async function sendDiscordLog(env, order) {
  if (!env.DISCORD_WEBHOOK_URL) {
    console.warn(
      "DISCORD_WEBHOOK_URL is not configured."
    );

    return;
  }

  const color =
    order.finalPrice === 0
      ? 0x63d49b
      : 0xe3b82f;

  const embed = {
    title: "◆ New Gilded Donation Order",
    color,

    fields: [
      {
        name: "Order ID",
        value: order.orderId,
        inline: true,
      },

      {
        name: "Package",
        value: order.packName,
        inline: true,
      },

      {
        name: "Price",
        value:
          `$${order.finalPrice.toFixed(2)} USD`,
        inline: true,
      },

      {
        name: "Discord Username",
        value: order.discordUsername,
        inline: true,
      },

      {
        name: "Discord ID",
        value: order.discordId,
        inline: true,
      },

      {
        name: "Discount",
        value:
          order.discountPercent > 0
            ? `${order.discountPercent}%`
            : "None",
        inline: true,
      },

      {
        name: "Status",
        value: order.status,
        inline: false,
      },
    ],

    footer: {
      text: "Gilded Donation System",
    },

    timestamp: order.createdAt,
  };

  try {
    const response = await fetch(
      env.DISCORD_WEBHOOK_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          embeds: [embed],
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Discord webhook failed:",
        response.status,
        await response.text()
      );
    }
  } catch (error) {
    console.error(
      "Discord webhook error:",
      error
    );
  }
}


/* ============================================================
   HELPERS
============================================================ */

function generateOrderId() {
  const timestamp =
    Date.now().toString(36).toUpperCase();

  const random =
    crypto.randomUUID()
      .replaceAll("-", "")
      .substring(0, 8)
      .toUpperCase();

  return `GIL-${timestamp}-${random}`;
}


function json(data, status, env, origin) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        ...corsHeaders(
          env,
          origin
        ),
      },
    }
  );
}


function corsHeaders(env, origin) {
  const allowed =
    env.ALLOWED_ORIGIN;

  /*
   * Only allow your actual frontend.
   */

  const allowOrigin =
    origin && allowed && origin === allowed
      ? origin
      : allowed || "null";

  return {
    "Access-Control-Allow-Origin":
      allowOrigin,

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Max-Age":
      "86400",

    "Vary":
      "Origin",
  };
}
