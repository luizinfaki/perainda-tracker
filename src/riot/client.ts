import { defaultRateLimiter } from "./rateLimiter";

const MAX_429_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RiotApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RiotApiError";
  }
}

export class RiotNotFoundError extends RiotApiError {
  constructor() {
    super(404, "Recurso não encontrado na Riot API");
    this.name = "RiotNotFoundError";
  }
}

export async function riotRequest<T>(url: string): Promise<T> {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    throw new Error("RIOT_API_KEY não configurada no .env");
  }

  return defaultRateLimiter.schedule(async () => {
    let attempt = 0;

    for (;;) {
      const response = await fetch(url, {
        headers: { "X-Riot-Token": apiKey },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 404) {
        throw new RiotNotFoundError();
      }

      if (response.status === 429 && attempt < MAX_429_RETRIES) {
        const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "1");
        attempt++;
        await sleep((retryAfterSeconds + 0.5) * 1000);
        continue;
      }

      const body = await response.text().catch(() => "");
      throw new RiotApiError(response.status, `Riot API respondeu ${response.status}: ${body}`);
    }
  });
}
