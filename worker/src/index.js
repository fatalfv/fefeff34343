function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

function clean(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function makeId() {
  return "DON-" + crypto.randomUUID().slice(0, 8).toUpperCase();
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
      });
    }

    // Worker health check
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        "OGFN Donation Worker is online.",
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Access-Control-Allow-Origin": origin
          }
        }
      );
    }

    // Donation reference endpoint
    if (
      url.pathname === "/api/donation-reference" &&
      request.method === "POST"
    ) {
      if (!env.DISCORD_WEBHOOK_URL) {
        return json(
          {
            error: "DISCORD_WEBHOOK_URL is not configured."
          },
          500,
          origin
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            error: "Invalid JSON."
          },
          400,
          origin
        );
      }

      const discord = clean(body.discord, 100);
      const reference = clean(body.reference, 120);
      const amount = clean(body.amount, 30);

      if (!reference) {
        return json(
          {
            error: "Donation reference is required."
          },
          400,
          origin
        );
      }

      const id = makeId();

      const webhookPayload = {
        username: "Donation Portal",

        embeds: [
          {
            title: "💙 New Donation Reference",
            color: 5079807,

            fields: [
              {
                name: "Portal ID",
                value: id,
                inline: true
              },

              {
                name: "Discord",
                value: discord || "Not provided",
                inline: true
              },

              {
                name: "Amount",
                value: amount || "Not provided",
                inline: true
              },

              {
                name: "Reference",
                value: reference,
                inline: false
              }
            ],

            footer: {
              text: "OGFN Donation Portal"
            },

            timestamp: new Date().toISOString()
          }
        ]
      };

      const discordResponse = await fetch(
        env.DISCORD_WEBHOOK_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(webhookPayload)
        }
      );

      if (!discordResponse.ok) {
        return json(
          {
            error:
              "Discord notification could not be delivered."
          },
          502,
          origin
        );
      }

      return json(
        {
          ok: true,
          id
        },
        200,
        origin
      );
    }

    return json(
      {
        error: "Not found."
      },
      404,
      origin
    );
  }
};