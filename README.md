# OGFN Donation Website

A static donation website designed for Cloudflare Pages with a Cloudflare Worker backend.

## Features

- PayPal donation button
- Donation reference submission
- Discord webhook notifications
- Responsive design
- Cloudflare Pages compatible
- Cloudflare Worker backend
- No payment secrets exposed to the frontend

## Project structure

ogfn-donation-site/

├── index.html
├── styles.css
├── app.js
├── config.js
├── README.md
│
└── worker/
    ├── package.json
    ├── wrangler.toml
    └── src/
        └── index.js

## Configure PayPal

Open config.js.

Change:

https://paypal.me/YOURNAME

to your public PayPal donation URL.

Never put PayPal private credentials or secrets in this file.

## Configure the Discord Worker

Open a terminal inside the worker folder.

Install Wrangler:

npm install

Log in:

npx wrangler login

Set the Discord webhook:

npx wrangler secret put DISCORD_WEBHOOK_URL

Paste your Discord webhook URL.

Deploy:

npx wrangler deploy

Copy the Worker URL into config.js.

## Cloudflare Pages

Push the project to GitHub.

Create a Cloudflare Pages project.

Connect your GitHub repository.

Use:

Framework preset:
None

Build command:
leave blank

Build output directory:
/

Deploy.

Cloudflare will provide a pages.dev address.

## Security

This website intentionally does not collect:

- passwords
- account cookies
- 2FA codes
- authentication tokens
- gift-card codes

Only a donation/reference ID, optional Discord username and optional amount are submitted for verification.