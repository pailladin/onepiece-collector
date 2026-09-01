This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Vercel cron: Cardmarket Price Guide

This repo contains a Vercel cron endpoint that downloads the One Piece Cardmarket price guide JSON every day and uploads it to the `cron` storage bucket in Supabase.

Files:
- `src/app/api/cron/cardmarket-price-guide/route.ts`
- `src/app/api/cron/cardmarket-catalog/route.ts`
- `vercel.json`
- `supabase/cardmarket-price-guide-table.sql`
- `supabase/cardmarket-price-guide-snapshots-table.sql`
- `supabase/cardmarket-print-links.sql`
- `supabase/cardmarket-catalog-table.sql`

Required Vercel env vars:
- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CARDMARKET_PRICE_GUIDE_BUCKET=cron` (optional, defaults to `cron`)
- `CARDMARKET_PRICE_GUIDE_SOURCE_URL=https://www.cardmarket.com/en/Spoils/Data/Price-Guide` (optional)
- `CARDMARKET_PRICE_GUIDE_DIRECT_URL=<direct price_guide_18.json url>` (optional fallback if source page returns 403)
- `CARDMARKET_CATALOG_URL=https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json` (optional)

Before enabling cron, run these SQL files in Supabase SQL Editor:
- `supabase/cardmarket-price-guide-table.sql` (table fed by daily cron JSON)
- `supabase/cardmarket-price-guide-snapshots-table.sql` (daily history snapshots of card prices)
- `supabase/cardmarket-catalog-table.sql` (table fed by daily catalog JSON)
- `supabase/cardmarket-print-links.sql` (manual/assisted mapping table between local prints and Cardmarket product ids)

Manual test:

```bash
curl -X GET "https://<your-domain>/api/cron/cardmarket-price-guide" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Uploaded files:
- `cardmarket/price-guide/YYYY-MM-DD/price_guide_18.json`
- `cardmarket/price-guide/latest/price_guide_18.json`

Database refresh:
- Daily upsert into `public.cardmarket_price_guide_entries`
- Rows not seen in the latest JSON are deleted automatically
- Daily upsert into `public.cardmarket_price_guide_snapshots` (one snapshot per `last_seen_on` date)
- Daily upsert into `public.cardmarket_catalog_entries`
- Rows not seen in the latest catalog JSON are deleted automatically

Admin mapping UI:
- `/admin/cardmarket-links`
- Workflow: choose a set, load unlinked prints, click "Charger suggestions" to use catalog candidates, click one image/candidate to fill `idProduct`, then validate manually with "Associer"

## Card images on Cloudflare R2

Card images can be served from and uploaded to an S3-compatible Cloudflare R2 bucket while Supabase remains the database and authentication provider.

Required environment variables:

```bash
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_BUCKET=cards-images
NEXT_PUBLIC_IMAGES_BASE_URL=https://images.onepiece-collector.com
EXPO_PUBLIC_IMAGES_BASE_URL=https://images.onepiece-collector.com
```

Until `NEXT_PUBLIC_IMAGES_BASE_URL` is set, the web application continues to use the existing public Supabase bucket URL.

Preview the Supabase inventory without copying anything:

```bash
npm run migrate:images:r2
```

Copy all objects to R2 while preserving their paths:

```bash
npm run migrate:images:r2 -- --execute
```

The migration never removes the source objects from Supabase. Keep them until the R2 URLs and all upload workflows have been verified in production.
