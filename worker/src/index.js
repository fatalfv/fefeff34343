/*
==========================================================
GILDED PAYMENT WORKER
==========================================================

Cloudflare Worker

Responsibilities:

- Validate packs
- Validate discount codes
- Create orders
- Enforce one-use discount codes
- Send Discord webhook notifications
- Handle free 100% discount orders
- Provide payment redirect endpoint

==========================================================
*/


/*
==========================================================
PACKS

KEEP THIS LIST IN SYNC WITH index.html.

The price here is the authoritative price.

==========================================================
*/

const PACKS = {

  "dev-locker": {
    name: "Dev Locker",
    price: 14.99
  },

  "full-locker": {
    name: "Full Locker",
    price: 10.99
  }

};


/*
==========================================================
DISCOUNT CODES

VERY EASY TO ADD MORE.

admin123:

100% off
one successful use

==========================================================
*/

const DISCOUNT_CODES = {

  ADMIN123: {
    percent: 100,
    maxUses: 1
  }

};


/*
==========================================================
CORS
==========================================================
*/

function corsHeaders(env) {

  return {

    "Access-Control-Allow-Origin":
      env.ALLOWED_ORIGIN || "*",

    "Access-Control-Allow-Methods":
      "GET,POST,OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Content-Type":
      "application/json"

  };

}


/*
==========================================================
JSON RESPONSE
==========================================================
*/

function json(data,status,env) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:corsHeaders(env)
    }
  );

}


/*
==========================================================
ORDER ID
==========================================================
*/

function createOrderId() {

  const random =
    crypto.randomUUID()
      .replaceAll("-","")
      .substring(0,10)
      .toUpperCase();

  return `GILDED-${random}`;

}


/*
==========================================================
NORMALIZE CODE
==========================================================
*/

function normalizeCode(code) {

  return String(code || "")
    .trim()
    .toUpperCase();

}


/*
==========================================================
GET PACK
==========================================================
*/

function getPack(packId) {

  return PACKS[packId] || null;

}


/*
==========================================================
CHECK DISCOUNT
==========================================================
*/

async function checkDiscount(
  env,
  code,
  packId
) {

  const normalized =
    normalizeCode(code);

  if (!normalized) {

    return {
      valid:false,
      error:"No discount code supplied."
    };

  }


  const discount =
    DISCOUNT_CODES[normalized];

  if (!discount) {

    return {
      valid:false,
      error:"Invalid discount code."
    };

  }


  /*
    KV key storing successful uses.

    Example:

    discount-used:ADMIN123
  */

  const key =
    `discount-used:${normalized}`;


  const used =
    await env.GILDED_KV.get(key);


  const useCount =
    used ? Number(used) : 0;


  if (
    useCount >=
    discount.maxUses
  ) {

    return {
      valid:false,
      error:"This discount code has already been used."
    };

  }


  const pack =
    getPack(packId);

  if (!pack) {

    return {
      valid:false,
      error:"Invalid pack."
    };

  }


  const discountAmount =
    Math.round(
      pack.price *
      (discount.percent / 100) *
      100
    ) / 100;


  const finalPrice =
    Math.max(
      0,
      Math.round(
        (pack.price - discountAmount) *
        100
      ) / 100
    );


  return {

    valid:true,

    code:normalized,

    percent:
      discount.percent,

    discountAmount,

    finalPrice,

    maxUses:
      discount.maxUses,

    useCount

  };

}


/*
==========================================================
CLAIM DISCOUNT

IMPORTANT:

Only call this AFTER the order is successfully
created.

For admin123, this permanently consumes
the one available use.

==========================================================
*/

async function claimDiscount(
  env,
  code
) {

  const normalized =
    normalizeCode(code);

  if (!normalized) return;

  const discount =
    DISCOUNT_CODES[normalized];

  if (!discount) return;


  const key =
    `discount-used:${normalized}`;


  const used =
    await env.GILDED_KV.get(key);


  const currentUses =
    used ? Number(used) : 0;


  /*
    Re-check immediately before consuming.
  */

  if (
    currentUses >=
    discount.maxUses
  ) {

    throw new Error(
      "Discount code has already been used."
    );

  }


  await env.GILDED_KV.put(
    key,
    String(currentUses + 1)
  );

}


/*
==========================================================
DISCORD WEBHOOK
==========================================================
*/

async function sendDiscordWebhook(
  env,
  order,
  type
) {

  if (!env.DISCORD_WEBHOOK_URL) {

    console.log(
      "DISCORD_WEBHOOK_URL is not configured."
    );

    return;

  }


  let content;


  if (type === "FREE") {

    content = {

      username:"Gilded Orders",

      embeds:[{

        title:"🎁 FREE ORDER",

        color:0x63d49b,

        fields:[

          {
            name:"Order ID",
            value:order.orderId,
            inline:true
          },

          {
            name:"Pack",
            value:order.packName,
            inline:true
          },

          {
            name:"Original Price",
            value:`$${order.originalPrice.toFixed(2)}`,
            inline:true
          },

          {
            name:"Discount",
            value:`${order.discountPercent}%`,
            inline:true
          },

          {
            name:"Final Price",
            value:"$0.00",
            inline:true
          },

          {
            name:"Discord Username",
            value:order.discordUsername,
            inline:true
          },

          {
            name:"Discord ID",
            value:order.discordId,
            inline:true
          }

        ],

        footer:{
          text:"Gilded Orders"
        },

        timestamp:
          new Date().toISOString()

      }]

    };

  }

  else {

    content = {

      username:"Gilded Orders",

      embeds:[{

        title:"💰 NEW ORDER",

        color:0xe3b82f,

        fields:[

          {
            name:"Order ID",
            value:order.orderId,
            inline:true
          },

          {
            name:"Pack",
            value:order.packName,
            inline:true
          },

          {
            name:"Price",
            value:`$${order.finalPrice.toFixed(2)}`,
            inline:true
          },

          {
            name:"Discount",
            value:
              order.discountPercent
              ? `${order.discountPercent}%`
              : "None",
            inline:true
          },

          {
            name:"Discord Username",
            value:order.discordUsername,
            inline:true
          },

          {
            name:"Discord ID",
            value:order.discordId,
            inline:true
          }

        ],

        footer:{
          text:"Gilded Orders"
        },

        timestamp:
          new Date().toISOString()

      }]

    };

  }


  await fetch(
    env.DISCORD_WEBHOOK_URL,
    {
      method:"POST",

      headers:{
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(content)

    }
  );

}


/*
==========================================================
VALIDATE DISCOUNT API
==========================================================
*/

async function validateDiscount(
  request,
  env
) {

  let body;

  try {

    body =
      await request.json();

  }

  catch {

    return json(
      {
        valid:false,
        error:"Invalid request."
      },
      400,
      env
    );

  }


  const result =
    await checkDiscount(
      env,
      body.code,
      body.packId
    );


  if (!result.valid) {

    return json(
      result,
      400,
      env
    );

  }


  return json(
    result,
    200,
    env
  );

}


/*
==========================================================
CREATE ORDER
==========================================================
*/

async function createOrder(
  request,
  env
) {

  let body;

  try {

    body =
      await request.json();

  }

  catch {

    return json(
      {
        error:"Invalid request."
      },
      400,
      env
    );

  }


  const {

    packId,
    discordUsername,
    discordId,
    discountCode

  } = body;


  /*
    Basic validation
  */

  if (!packId) {

    return json(
      {
        error:"Pack is required."
      },
      400,
      env
    );

  }


  if (
    !discordUsername ||
    discordUsername.length > 100
  ) {

    return json(
      {
        error:"Invalid Discord username."
      },
      400,
      env
    );

  }


  if (
    !/^[0-9]{17,20}$/.test(
      String(discordId || "")
    )
  ) {

    return json(
      {
        error:"Invalid Discord ID."
      },
      400,
      env
    );

  }


  const pack =
    getPack(packId);


  if (!pack) {

    return json(
      {
        error:"Invalid pack."
      },
      400,
      env
    );

  }


  let finalPrice =
    pack.price;

  let discountPercent =
    0;

  let discountAmount =
    0;

  let normalizedDiscount = "";


  /*
    Validate discount again on the server.

    NEVER trust the price sent by the browser.
  */

  if (discountCode) {

    const discount =
      await checkDiscount(
        env,
        discountCode,
        packId
      );


    if (!discount.valid) {

      return json(
        {
          error:
            discount.error
        },
        400,
        env
      );

    }


    finalPrice =
      discount.finalPrice;

    discountPercent =
      discount.percent;

    discountAmount =
      discount.discountAmount;

    normalizedDiscount =
      discount.code;

  }


  const orderId =
    createOrderId();


  const order = {

    orderId,

    packId,

    packName:
      pack.name,

    originalPrice:
      pack.price,

    finalPrice,

    discountCode:
      normalizedDiscount,

    discountPercent,

    discountAmount,

    discordUsername,

    discordId,

    createdAt:
      new Date().toISOString(),

    status:
      finalPrice === 0
      ? "FREE"
      : "PENDING_PAYMENT"

  };


  /*
    Store order.

    KV is suitable for this simple setup.
    For larger production systems, use a database.
  */

  await env.GILDED_KV.put(
    `order:${orderId}`,
    JSON.stringify(order),
    {
      expirationTtl:
        60 * 60 * 24 * 30
    }
  );


  /*
    100% discount.

    No PayPal/card payment needed.
  */

  if (finalPrice === 0) {

    /*
      Consume the one-use code.
    */

    if (normalizedDiscount) {

      try {

        await claimDiscount(
          env,
          normalizedDiscount
        );

      }

      catch(error) {

        /*
          Remove order if the code could
          not be claimed.
        */

        await env.GILDED_KV.delete(
          `order:${orderId}`
        );

        return json(
          {
            error:
              error.message
          },
          409,
          env
        );

      }

    }


    order.status =
      "FREE_COMPLETED";


    await env.GILDED_KV.put(
      `order:${orderId}`,
      JSON.stringify(order),
      {
        expirationTtl:
          60 * 60 * 24 * 30
      }
    );


    await sendDiscordWebhook(
      env,
      order,
      "FREE"
    );


    return json(
      {
        success:true,
        free:true,
        orderId,
        finalPrice:0
      },
      200,
      env
    );

  }


  /*
    Normal paid order.

    Payment URL is configured through
    the Cloudflare Worker environment.
  */

  return json(
    {
      success:true,
      free:false,
      orderId,
      finalPrice
    },
    200,
    env
  );

}


/*
==========================================================
PAYMENT ENDPOINT
==========================================================
*/

async function startPayment(
  request,
  env
) {

  let body;

  try {

    body =
      await request.json();

  }

  catch {

    return json(
      {
        error:"Invalid request."
      },
      400,
      env
    );

  }


  const orderId =
    body.orderId;

  const method =
    body.method;


  if (
    !orderId ||
    !["paypal","card"].includes(method)
  ) {

    return json(
      {
        error:"Invalid payment request."
      },
      400,
      env
    );

  }


  const rawOrder =
    await env.GILDED_KV.get(
      `order:${orderId}`
    );


  if (!rawOrder) {

    return json(
      {
        error:"Order not found."
      },
      404,
      env
    );

  }


  const order =
    JSON.parse(rawOrder);


  if (
    order.finalPrice <= 0
  ) {

    return json(
      {
        error:"This order does not require payment."
      },
      400,
      env
    );

  }


  /*
    Configure your real checkout URLs
    as Cloudflare Worker secrets.

    PAYPAL_PAYMENT_URL
    CARD_PAYMENT_URL

    For a real dynamic checkout system,
    replace this with your payment provider's
    API checkout creation.
  */

  let url;

  if (method === "paypal") {

    url =
      env.PAYPAL_PAYMENT_URL;

  }

  else {

    url =
      env.CARD_PAYMENT_URL;

  }


  if (!url) {

    return json(
      {
        error:
          "Payment provider is not configured yet."
      },
      503,
      env
    );

  }


  return json(
    {
      success:true,
      url
    },
    200,
    env
  );

}


/*
==========================================================
REQUEST HANDLER
==========================================================
*/

export default {

  async fetch(request,env) {

    /*
      CORS preflight
    */

    if (
      request.method === "OPTIONS"
    ) {

      return new Response(
        null,
        {
          headers:
            corsHeaders(env)
        }
      );

    }


    const url =
      new URL(request.url);


    /*
      Health check
    */

    if (
      url.pathname === "/"
    ) {

      return json(
        {
          online:true,
          service:"Gilded Payment API"
        },
        200,
        env
      );

    }


    /*
      Discount validation
    */

    if (
      url.pathname ===
      "/api/discount/validate" &&
      request.method === "POST"
    ) {

      return validateDiscount(
        request,
        env
      );

    }


    /*
      Create order
    */

    if (
      url.pathname ===
      "/api/order/create" &&
      request.method === "POST"
    ) {

      return createOrder(
        request,
        env
      );

    }


    /*
      Payment
    */

    if (
      url.pathname ===
      "/api/order/payment" &&
      request.method === "POST"
    ) {

      return startPayment(
        request,
        env
      );

    }


    return json(
      {
        error:"Not found."
      },
      404,
      env
    );

  }

};
