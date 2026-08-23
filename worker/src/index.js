const PACKS = {
  "dev-locker": {
    id: "dev-locker",
    name: "Dev Locker",
    price: 14.99,
  },

  "full-locker": {
    id: "full-locker",
    name: "Full Locker",
    price: 10.99,
  },
};

const DISCOUNT_CODES = {
  ADMIN123: {
    percent: 100,
    maxUses: 1,
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

      /*
      ======================================================
      HEALTH
      ======================================================
      */

      if (
        url.pathname === "/api/health" &&
        request.method === "GET"
      ) {

        return json({
          success: true,
          service: "Gilded Payment API",
          version: "2.0.0",
        }, 200, env, origin);

      }


      /*
      ======================================================
      DISCOUNT VALIDATE
      ======================================================
      */

      if (
        url.pathname === "/api/discount/validate" &&
        request.method === "POST"
      ) {

        return await validateDiscount(
          request,
          env,
          origin
        );

      }


      /*
      ======================================================
      CREATE ORDER
      ======================================================
      */

      if (
        url.pathname === "/api/order/create" &&
        request.method === "POST"
      ) {

        return await createOrder(
          request,
          env,
          origin
        );

      }


      /*
      ======================================================
      START PAYMENT
      ======================================================
      */

      if (
        url.pathname === "/api/order/payment" &&
        request.method === "POST"
      ) {

        return await startPayment(
          request,
          env,
          origin
        );

      }


      /*
      ======================================================
      PAYMENT RETURN
      ======================================================
      */

      if (
        url.pathname === "/payment/success" &&
        request.method === "GET"
      ) {

        return await paymentSuccess(
          request,
          env
        );

      }


      /*
      ======================================================
      PAYMENT CANCEL
      ======================================================
      */

      if (
        url.pathname === "/payment/cancel" &&
        request.method === "GET"
      ) {

        return Response.redirect(
          `${env.ALLOWED_ORIGIN}?payment=cancelled`,
          302
        );

      }


      /*
      ======================================================
      404
      ======================================================
      */

      return json({
        success: false,
        error: "Not found",
      }, 404, env, origin);

    } catch (error) {

      console.error("WORKER ERROR:", error);

      return json({
        success: false,
        error: "Internal server error.",
      }, 500, env, origin);

    }

  },
};


/*
============================================================
DISCOUNT VALIDATION
============================================================
*/

async function validateDiscount(
  request,
  env,
  origin
) {

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON.",
    }, 400, env, origin);
  }

  const code =
    String(body.code || "")
      .trim()
      .toUpperCase();

  const packId =
    String(body.packId || "")
      .trim();

  if (!code) {

    return json({
      valid: false,
      error: "Please enter a discount code.",
    }, 400, env, origin);

  }

  const pack = PACKS[packId];

  if (!pack) {

    return json({
      valid: false,
      error: "Invalid package.",
    }, 400, env, origin);

  }

  const discount =
    DISCOUNT_CODES[code];

  if (!discount) {

    return json({
      valid: false,
      error: "Invalid discount code.",
    }, 400, env, origin);

  }


  /*
  Check whether ADMIN123 has already been
  successfully redeemed.
  */

  const redemption =
    await env.GILDED_KV.get(
      `discount:${code}`
    );

  if (redemption) {

    let data;

    try {
      data = JSON.parse(redemption);
    } catch {
      data = {
        used: redemption === "used",
      };
    }

    if (data.used === true) {

      return json({
        valid: false,
        error: "This discount code has already been used.",
      }, 400, env, origin);

    }

  }


  const discountAmount =
    Number(
      (
        pack.price *
        discount.percent /
        100
      ).toFixed(2)
    );


  const finalPrice =
    Number(
      Math.max(
        0,
        pack.price - discountAmount
      ).toFixed(2)
    );


  return json({
    valid: true,
    code,
    percent: discount.percent,
    discountAmount,
    finalPrice,
  }, 200, env, origin);

}


/*
============================================================
CREATE ORDER
============================================================
*/

async function createOrder(
  request,
  env,
  origin
) {

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON.",
    }, 400, env, origin);
  }


  const packId =
    String(body.packId || "").trim();

  const discordUsername =
    String(body.discordUsername || "").trim();

  const discordId =
    String(body.discordId || "").trim();

  const discountCode =
    String(body.discountCode || "")
      .trim()
      .toUpperCase();


  /*
  Validate Discord username
  */

  if (!discordUsername) {

    return json({
      success: false,
      error: "Discord username is required.",
    }, 400, env, origin);

  }


  /*
  Validate Discord ID
  */

  if (!/^[0-9]{17,20}$/.test(discordId)) {

    return json({
      success: false,
      error: "Invalid Discord ID.",
    }, 400, env, origin);

  }


  /*
  Validate package
  */

  const pack =
    PACKS[packId];

  if (!pack) {

    return json({
      success: false,
      error: "Invalid package.",
    }, 400, env, origin);

  }


  /*
  Calculate server-side price.
  Never trust the price sent by the browser.
  */

  let finalPrice =
    pack.price;

  let discountAmount =
    0;

  let discountPercent =
    0;


  /*
  Discount
  */

  if (discountCode) {

    const discount =
      DISCOUNT_CODES[discountCode];

    if (!discount) {

      return json({
        success: false,
        error: "Invalid discount code.",
      }, 400, env, origin);

    }


    /*
    Check redemption
    */

    const existing =
      await env.GILDED_KV.get(
        `discount:${discountCode}`
      );

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

        return json({
          success: false,
          error:
            "This discount code has already been used.",
        }, 400, env, origin);

      }

    }


    discountPercent =
      discount.percent;

    discountAmount =
      Number(
        (
          pack.price *
          discount.percent /
          100
        ).toFixed(2)
      );

    finalPrice =
      Number(
        Math.max(
          0,
          pack.price - discountAmount
        ).toFixed(2)
      );

  }


  /*
  Generate order ID
  */

  const orderId =
    `GILDED-${Date.now()}-${randomString(6)}`;


  /*
  Create order
  */

  const order = {

    orderId,

    packId: pack.id,

    packName: pack.name,

    originalPrice: pack.price,

    finalPrice,

    discountCode:
      discountCode || null,

    discountPercent,

    discountAmount,

    discordUsername,

    discordId,

    status:
      finalPrice === 0
        ? "completed"
        : "pending_payment",

    paymentMethod: null,

    createdAt:
      new Date().toISOString(),

  };


  /*
  ========================================================
  IMPORTANT
  ========================================================

  For a FREE 100% order, mark the code used here.

  KV is used to remember the redemption.
  */

  if (
    finalPrice === 0 &&
    discountCode
  ) {

    await env.GILDED_KV.put(
      `discount:${discountCode}`,
      JSON.stringify({
        used: true,
        orderId,
        discordUsername,
        discordId,
        usedAt:
          new Date().toISOString(),
      })
    );

  }


  /*
  Save order
  */

  await env.GILDED_KV.put(
    `order:${orderId}`,
    JSON.stringify(order)
  );


  /*
  Send order to Discord webhook if configured.
  */

  if (env.DISCORD_WEBHOOK_URL) {

    await sendDiscordWebhook(
      env.DISCORD_WEBHOOK_URL,
      order
    );

  }


  /*
  FREE ORDER
  */

  if (finalPrice === 0) {

    return json({

      success: true,

      orderId,

      finalPrice: 0,

      free: true,

      status: "completed",

    }, 200, env, origin);

  }


  /*
  Paid order
  */

  return json({

    success: true,

    orderId,

    finalPrice,

    free: false,

    status: "pending_payment",

  }, 200, env, origin);

}


/*
============================================================
START PAYMENT
============================================================
*/

async function startPayment(
  request,
  env,
  origin
) {

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON.",
    }, 400, env, origin);
  }


  const orderId =
    String(body.orderId || "").trim();

  const method =
    String(body.method || "")
      .trim()
      .toLowerCase();


  if (!orderId) {

    return json({
      success: false,
      error: "Order ID is required.",
    }, 400, env, origin);

  }


  if (
    method !== "paypal" &&
    method !== "card"
  ) {

    return json({
      success: false,
      error: "Invalid payment method.",
    }, 400, env, origin);

  }


  const rawOrder =
    await env.GILDED_KV.get(
      `order:${orderId}`
    );


  if (!rawOrder) {

    return json({
      success: false,
      error: "Order not found.",
    }, 404, env, origin);

  }


  const order =
    JSON.parse(rawOrder);


  if (order.finalPrice <= 0) {

    return json({
      success: false,
      error: "This order does not require payment.",
    }, 400, env, origin);

  }


  /*
  ========================================================
  PAYPAL
  ========================================================
  */

  if (method === "paypal") {

    if (
      !env.PAYPAL_CLIENT_ID ||
      !env.PAYPAL_CLIENT_SECRET
    ) {

      return json({
        success: false,
        error:
          "PayPal has not been configured on the Worker yet.",
      }, 503, env, origin);

    }


    try {

      const url =
        await createPayPalOrder(
          order,
          env
        );


      order.paymentMethod =
        "paypal";

      order.paymentStartedAt =
        new Date().toISOString();


      await env.GILDED_KV.put(
        `order:${orderId}`,
        JSON.stringify(order)
      );


      return json({
        success: true,
        url,
      }, 200, env, origin);

    } catch (error) {

      console.error(
        "PAYPAL ERROR:",
        error
      );

      return json({
        success: false,
        error:
          "Unable to create PayPal checkout.",
      }, 500, env, origin);

    }

  }


  /*
  ========================================================
  CARD / STRIPE
  ========================================================
  */

  if (method === "card") {

    if (!env.STRIPE_SECRET_KEY) {

      return json({
        success: false,
        error:
          "Card payments have not been configured on the Worker yet.",
      }, 503, env, origin);

    }


    try {

      const url =
        await createStripeCheckout(
          order,
          env
        );


      order.paymentMethod =
        "card";

      order.paymentStartedAt =
        new Date().toISOString();


      await env.GILDED_KV.put(
        `order:${orderId}`,
        JSON.stringify(order)
      );


      return json({
        success: true,
        url,
      }, 200, env, origin);

    } catch (error) {

      console.error(
        "STRIPE ERROR:",
        error
      );

      return json({
        success: false,
        error:
          "Unable to create card checkout.",
      }, 500, env, origin);

    }

  }

}


/*
============================================================
PAYPAL CREATE ORDER
============================================================
*/

async function createPayPalOrder(
  order,
  env
) {

  const base =
    env.PAYPAL_ENV === "production"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";


  /*
  Get access token
  */

  const auth =
    btoa(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
    );


  const tokenResponse =
    await fetch(
      `${base}/v1/oauth2/token`,
      {
        method: "POST",

        headers: {
          "Authorization":
            `Basic ${auth}`,

          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          "grant_type=client_credentials",
      }
    );


  if (!tokenResponse.ok) {

    throw new Error(
      "PayPal authentication failed."
    );

  }


  const tokenData =
    await tokenResponse.json();


  /*
  Create PayPal order
  */

  const response =
    await fetch(
      `${base}/v2/checkout/orders`,
      {
        method: "POST",

        headers: {

          "Authorization":
            `Bearer ${tokenData.access_token}`,

          "Content-Type":
            "application/json",

        },

        body: JSON.stringify({

          intent: "CAPTURE",

          purchase_units: [

            {

              reference_id:
                order.orderId,

              description:
                order.packName,

              amount: {

                currency_code: "USD",

                value:
                  order.finalPrice.toFixed(2),

              },

            },

          ],

          application_context: {

            brand_name:
              "Gilded",

            user_action:
              "PAY_NOW",

            return_url:
              `${env.WORKER_URL}/payment/success?method=paypal&orderId=${encodeURIComponent(order.orderId)}`,

            cancel_url:
              `${env.WORKER_URL}/payment/cancel?orderId=${encodeURIComponent(order.orderId)}`,

          },

        }),

      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "PAYPAL CREATE:",
      data
    );

    throw new Error(
      "PayPal order creation failed."
    );

  }


  const approve =
    data.links?.find(
      link =>
        link.rel === "approve"
    );


  if (!approve?.href) {

    throw new Error(
      "PayPal approval URL missing."
    );

  }


  return approve.href;

}


/*
============================================================
STRIPE CHECKOUT
============================================================
*/

async function createStripeCheckout(
  order,
  env
) {

  const params =
    new URLSearchParams();


  params.append(
    "mode",
    "payment"
  );


  params.append(
    "success_url",
    `${env.WORKER_URL}/payment/success?method=card&orderId=${encodeURIComponent(order.orderId)}&session_id={CHECKOUT_SESSION_ID}`
  );


  params.append(
    "cancel_url",
    `${env.WORKER_URL}/payment/cancel?orderId=${encodeURIComponent(order.orderId)}`
  );


  params.append(
    "line_items[0][price_data][currency]",
    "usd"
  );


  params.append(
    "line_items[0][price_data][product_data][name]",
    order.packName
  );


  params.append(
    "line_items[0][price_data][product_data][description]",
    `Gilded Order ${order.orderId}`
  );


  params.append(
    "line_items[0][price_data][unit_amount]",
    String(
      Math.round(
        order.finalPrice * 100
      )
    )
  );


  params.append(
    "line_items[0][quantity]",
    "1"
  );


  params.append(
    "metadata[orderId]",
    order.orderId
  );


  const response =
    await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {

        method: "POST",

        headers: {

          "Authorization":
            `Bearer ${env.STRIPE_SECRET_KEY}`,

          "Content-Type":
            "application/x-www-form-urlencoded",

        },

        body: params,

      }
    );


  const data =
    await response.json();


  if (!response.ok) {

    console.error(
      "STRIPE CREATE:",
      data
    );

    throw new Error(
      "Stripe checkout creation failed."
    );

  }


  return data.url;

}


/*
============================================================
PAYMENT SUCCESS
============================================================
*/

async function paymentSuccess(
  request,
  env
) {

  const url =
    new URL(request.url);

  const orderId =
    url.searchParams.get(
      "orderId"
    );

  const method =
    url.searchParams.get(
      "method"
    );


  if (!orderId) {

    return Response.redirect(
      `${env.ALLOWED_ORIGIN}?payment=error`,
      302
    );

  }


  const rawOrder =
    await env.GILDED_KV.get(
      `order:${orderId}`
    );


  if (!rawOrder) {

    return Response.redirect(
      `${env.ALLOWED_ORIGIN}?payment=error`,
      302
    );

  }


  const order =
    JSON.parse(rawOrder);


  /*
  IMPORTANT:

  The return URL itself should not be treated as
  proof of payment.

  For production, configure Stripe webhooks and
  PayPal capture/webhooks to mark the order paid.
  */

  order.paymentReturnAt =
    new Date().toISOString();

  order.returnMethod =
    method;


  await env.GILDED_KV.put(
    `order:${orderId}`,
    JSON.stringify(order)
  );


  return Response.redirect(
    `${env.ALLOWED_ORIGIN}?payment=pending&orderId=${encodeURIComponent(orderId)}`,
    302
  );

}


/*
============================================================
DISCORD WEBHOOK
============================================================
*/

async function sendDiscordWebhook(
  webhook,
  order
) {

  try {

    await fetch(
      webhook,
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          username: "Gilded Orders",

          embeds: [

            {

              title:
                "New Gilded Order",

              color:
                0xE3B82F,

              fields: [

                {
                  name: "Order",
                  value:
                    order.orderId,
                  inline: true,
                },

                {
                  name: "Package",
                  value:
                    order.packName,
                  inline: true,
                },

                {
                  name: "Discord",
                  value:
                    order.discordUsername,
                  inline: true,
                },

                {
                  name: "Discord ID",
                  value:
                    order.discordId,
                  inline: true,
                },

                {
                  name: "Original Price",
                  value:
                    `$${order.originalPrice.toFixed(2)}`,
                  inline: true,
                },

                {
                  name: "Final Price",
                  value:
                    `$${order.finalPrice.toFixed(2)}`,
                  inline: true,
                },

                {
                  name: "Discount",
                  value:
                    order.discountCode
                      ? `${order.discountCode} (${order.discountPercent}%)`
                      : "None",
                  inline: false,
                },

                {
                  name: "Status",
                  value:
                    order.status,
                  inline: false,
                },

              ],

              timestamp:
                new Date().toISOString(),

            },

          ],

        }),

      }
    );

  } catch (error) {

    console.error(
      "DISCORD WEBHOOK ERROR:",
      error
    );

  }

}


/*
============================================================
RANDOM ID
============================================================
*/

function randomString(length) {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let output = "";

  for (
    let i = 0;
    i < length;
    i++
  ) {

    output +=
      chars[
        Math.floor(
          Math.random() *
          chars.length
        )
      ];

  }

  return output;

}


/*
============================================================
JSON RESPONSE
============================================================
*/

function json(
  data,
  status,
  env,
  origin
) {

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


/*
============================================================
CORS
============================================================
*/

function corsHeaders(
  env,
  origin
) {

  const allowed =
    env.ALLOWED_ORIGIN;

  return {

    "Access-Control-Allow-Origin":
      origin === allowed
        ? origin
        : allowed,

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Vary":
      "Origin",

  };

}
