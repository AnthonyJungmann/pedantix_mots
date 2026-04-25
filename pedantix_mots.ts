type Entry = [number, number, [string, string]];

type History = Entry[];
type CountByWord = Record<string, number>;

type FetchRetryOptions = {
  headers?: HeadersInit;
  maxRetries?: number;
  timeoutMs?: number;
  delayMs?: number;
  maxDelayMs?: number;
};

type WikiResponse = {
  query?: {
    pages?: Record<string, { extract?: string }>;
  };
};

const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getLogUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}

async function fetchWithRetry(
  url: string,
  {
    headers = browserHeaders,
    maxRetries = 5,
    timeoutMs = 25_000,
    delayMs = 2_000,
    maxDelayMs = 20_000,
  }: FetchRetryOptions = {},
): Promise<Response | null> {
  const logUrl = getLogUrl(url);
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });

      if (response.ok) {
        return response;
      }

      const shouldRetry = response.status === 429 || response.status === 403 || response.status >= 500;
      if (!shouldRetry || attempt === maxRetries) {
        console.error(`Request failed with status ${response.status} for ${logUrl}`);
        return null;
      }

      const retryAfterRaw = response.headers.get("retry-after");
      const retryAfterAsSeconds = retryAfterRaw ? Number(retryAfterRaw) : Number.NaN;
      const retryAfterDate = retryAfterRaw ? Date.parse(retryAfterRaw) : Number.NaN;

      let retryDelay = currentDelay;
      if (Number.isFinite(retryAfterAsSeconds) && retryAfterAsSeconds > 0) {
        retryDelay = retryAfterAsSeconds * 1_000;
      } else if (Number.isFinite(retryAfterDate)) {
        retryDelay = Math.max(0, retryAfterDate - Date.now());
      }

      retryDelay = Math.min(retryDelay, maxDelayMs);

      console.log(`Attempt ${attempt} failed with status ${response.status}, retrying in ${retryDelay}ms...`);
      await delay(retryDelay);
      currentDelay *= 2;
    } catch (error: unknown) {
      if (attempt === maxRetries) {
        console.error(`Request failed after ${maxRetries} attempts for ${logUrl}: ${getErrorMessage(error)}`);
        return null;
      }

      console.log(`Attempt ${attempt} failed (${getErrorMessage(error)}), retrying in ${currentDelay}ms...`);
      await delay(currentDelay);
      currentDelay *= 2;
    }
  }

  return null;
}

function toHistoryEntry(rawEntry: unknown): Entry | null {
  if (!Array.isArray(rawEntry) || rawEntry.length < 3) {
    return null;
  }

  const id = rawEntry[0];
  const timestamp = rawEntry[1];
  const titlesRaw = rawEntry[2];

  if (typeof id !== "number" || typeof timestamp !== "number" || !Array.isArray(titlesRaw)) {
    return null;
  }

  const primaryTitleRaw = titlesRaw[0];
  const secondaryTitleRaw = titlesRaw[1];

  const primaryTitle = typeof primaryTitleRaw === "string" ? primaryTitleRaw.trim() : "";
  const secondaryTitle = typeof secondaryTitleRaw === "string" ? secondaryTitleRaw : "";

  if (!primaryTitle) {
    return null;
  }

  return [id, timestamp, [primaryTitle, secondaryTitle]];
}

function mergeHistoryEntries(remoteHistory: unknown, localHistory: unknown): History {
  const mergedHistory: History = [];
  const seenIds = new Set<number>();

  const allEntries = [
    ...(Array.isArray(remoteHistory) ? remoteHistory : []),
    ...(Array.isArray(localHistory) ? localHistory : []),
  ];

  for (const rawEntry of allEntries) {
    const entry = toHistoryEntry(rawEntry);
    if (!entry) {
      continue;
    }

    const id = entry[0];
    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    mergedHistory.push(entry);
  }

  return mergedHistory;
}

async function readLocalHistory(path: string): Promise<History> {
  try {
    const rawLocalHistory = await Deno.readTextFile(path);
    const parsedHistory = JSON.parse(rawLocalHistory);
    return mergeHistoryEntries([], parsedHistory);
  } catch (error: unknown) {
    console.warn(`Unable to read local history (${path}): ${getErrorMessage(error)}. Using empty history.`);
    return [];
  }
}

function countWords(text: string, counters: CountByWord): void {
  const words = text.split(/[^\p{Letter}]+/gu).filter(Boolean);

  for (const word of words) {
    counters[word] = (counters[word] ?? 0) + 1;
  }
}

const localHistory = await readLocalHistory("history.json");

let remoteHistory: History = [];
const remoteHistoryResponse = await fetchWithRetry("https://pedantix.certitudes.org/history");
if (remoteHistoryResponse) {
  try {
    const parsedRemoteHistory = await remoteHistoryResponse.json();
    remoteHistory = mergeHistoryEntries(parsedRemoteHistory, []);
  } catch (error: unknown) {
    console.warn(`Unable to parse remote history: ${getErrorMessage(error)}. Using local history only.`);
  }
} else {
  console.warn("Unable to fetch remote history. Using local history only.");
}

const mergedHistory = mergeHistoryEntries(remoteHistory, localHistory);
await Deno.writeTextFile("history.json", JSON.stringify(mergedHistory, null, 2));

const pages = mergedHistory
  .map((entry) => entry[2][0])
  .filter((title) => title.length > 0);

const wordCounts: CountByWord = {};
let skippedPages = 0;

const batchSize = 20;
for (let index = 0; index < pages.length; index += batchSize) {
  const batchTitles = pages.slice(index, index + batchSize);

  await delay(300);

  const wikipediaResponse = await fetchWithRetry(
    `https://fr.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(batchTitles.join("|"))}`,
    { maxRetries: 2, delayMs: 1_000, maxDelayMs: 3_000, timeoutMs: 15_000 },
  );

  if (!wikipediaResponse) {
    skippedPages += batchTitles.length;
    console.warn(`Skipping batch ${index / batchSize + 1} due to repeated errors.`);
    continue;
  }

  const contentType = wikipediaResponse.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    skippedPages += batchTitles.length;
    console.error(`Unexpected content-type for batch ${index / batchSize + 1}: ${contentType}`);
    continue;
  }

  try {
    const wikipediaJson: WikiResponse = await wikipediaResponse.json();
    const pagesRecord = wikipediaJson.query?.pages;

    if (!pagesRecord || typeof pagesRecord !== "object") {
      skippedPages += batchTitles.length;
      console.warn(`Unexpected Wikipedia payload for batch ${index / batchSize + 1}.`);
      continue;
    }

    for (const pageResult of Object.values(pagesRecord)) {
      if (typeof pageResult.extract !== "string" || !pageResult.extract.trim()) {
        continue;
      }

      countWords(pageResult.extract.toLowerCase(), wordCounts);
    }
  } catch (error: unknown) {
    skippedPages += batchTitles.length;
    console.warn(`Unable to parse Wikipedia response for batch ${index / batchSize + 1}: ${getErrorMessage(error)}`);
  }
}

if (Object.keys(wordCounts).length === 0) {
  console.warn("No words extracted from Wikipedia. Keeping existing word files unchanged.");
  Deno.exit(0);
}

const words = Object.entries(wordCounts)
  .sort(([, a], [, b]) => b - a)
  .map(([word]) => word)
  .slice(0, 100)
  .join("\n");

await Deno.writeTextFile("mots.txt", words);

const stopWordsSet = new Set<string>();
const stopwordsResponse = await fetchWithRetry(
  "https://raw.githubusercontent.com/stopwords-iso/stopwords-fr/master/stopwords-fr.json",
  { maxRetries: 3, delayMs: 1_000 },
);

if (stopwordsResponse) {
  try {
    const rawStopWords = await stopwordsResponse.json();

    if (Array.isArray(rawStopWords)) {
      for (const rawWord of rawStopWords) {
        if (typeof rawWord === "string" && rawWord.trim()) {
          stopWordsSet.add(rawWord.toLowerCase());
        }
      }
    }
  } catch (error: unknown) {
    console.warn(`Unable to parse stopwords response: ${getErrorMessage(error)}. Continuing without stopwords.`);
  }
} else {
  console.warn("Unable to download stopwords list. Continuing without stopwords.");
}

const wordsWithoutStopwords = Object.entries(wordCounts)
  .filter(([word]) => !stopWordsSet.has(word))
  .sort(([, a], [, b]) => b - a)
  .map(([word]) => word)
  .slice(0, 100)
  .join("\n");

await Deno.writeTextFile("mots_sans_stopwords.txt", wordsWithoutStopwords);

const processedPages = Math.max(0, pages.length - skippedPages);
console.log(`Processed ${processedPages}/${pages.length} Wikipedia pages.`);
