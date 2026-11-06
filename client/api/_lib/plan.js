// The plan is read from the Stripe price's billing interval instead of being
// matched against STRIPE_PRICE_YEARLY. Prices can't be edited in Stripe, so a
// price change means new price IDs -- subscribers still on the old yearly price
// must keep showing as "yearly".
export function planFromPrice(price) {
  return price?.recurring?.interval === "year" ? "yearly" : "monthly";
}
