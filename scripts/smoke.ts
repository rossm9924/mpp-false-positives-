import { verifyProductMatch } from "../src/lib/verify";

// One real end-to-end verification (Bullet helmet / Mainland Skate & Surf —
// a confirmed MATCH in the original manual run).
async function main() {
  const result = await verifyProductMatch({
    productName: "Matte Black Deluxe Helmet  Sm/Med Bullet",
    brand: "Bullet",
    gtin: "659641663664",
    mpn: "66366",
    sku: "88381111",
    map: 35.0,
    storePrice: 34.99,
    size: "Sm/Med",
    sellerName: "Mainland Skate & Surf",
    sourceUrl:
      "https://www.google.com/search?ibp=oshop&q=product&prds=catalogid:17652295607543092277,pvo:25,pvt:hg,&hl=en&gl=us&udm=37",
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
