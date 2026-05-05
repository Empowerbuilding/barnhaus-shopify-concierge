const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "sf43pj-td.myshopify.com";

export async function fetchShopifyProduct(handle) {
  const url = `https://${DOMAIN}/admin/api/2024-01/products.json?handle=${encodeURIComponent(handle)}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const product = data.products?.[0];
  if (!product) return null;

  return {
    title: product.title,
    body_html: product.body_html,
    price: product.variants?.[0]?.price,
    images: (product.images || []).map(img => ({ src: img.src })),
    tags: product.tags,
  };
}
