import Stripe from "stripe";
import { getEnv } from "./env";

export function getStripe(): Stripe {
  const key = getEnv("STRIPE_SECRET_KEY");
  // Cloudflare WorkersはNodeのhttp/httpsモジュールを持たないため、
  // fetchベースのHTTPクライアントを明示的に使う必要がある。
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
