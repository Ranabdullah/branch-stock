# Branch Stock

[Run the local demo](local-demo/README.md) for inventory, expiry dates, movement charts and CSV/PDF reports. The local edition uses fictional data and runs without a backend.

Open the [demo](https://branch-stock-demo.ranakaharian1.workers.dev/) to try fictional products and shops. Choose **Try the shop view** to see what a shop can edit, or open the [sample Harbour Shop](https://branch-stock-demo.ranakaharian1.workers.dev/?sample-shop=harbour) directly. Both views use the same sample data in that browser. **Reset sample data** restores the examples.

For a shared installation, use an owner key to create shops and catalogue products. In the inventory, select a shop and choose **Create / replace shop link**. Send the link privately to that shop. A shop can adjust counts, record stock in or out, or create products specific to its location. A shop link grants access to whoever holds it. Replacing the link or archiving the shop revokes it.

The movement log records the server timestamp, before and after quantities, whether the change came from the owner or a shop, and any note. Archiving keeps the movement data. A new session needs the owner key or the original shop link.

## Deploy a separate workspace

1. Fork or download the repo. Install Node.js and run `npx wrangler login`.
2. Run `npx wrangler d1 create branch-stock-workspace`.
3. Copy `wrangler.example.jsonc` to `wrangler.live.jsonc`. Enter the new database ID and choose your own Worker name.
4. Run `npx wrangler d1 migrations apply branch-stock-workspace --remote --config wrangler.live.jsonc`.
5. Run `npx wrangler deploy --config wrangler.live.jsonc`.
6. Generate an owner key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save it in your password manager and enter it at the prompt from `npx wrangler secret put OWNER_KEY --config wrangler.live.jsonc`.
7. Open the Worker URL and choose **Connect as owner**. Use your key to create a shop and product. Keep the key private.
