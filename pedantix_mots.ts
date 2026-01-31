import _ from "https://deno.land/x/lodash@4.17.15-es/lodash.js";

type Entry = [number, number, [string, string]];

type History = Entry[];

const respHistoryPedantix: Response = await fetch("https://pedantix.certitudes.org/history");

if (!respHistoryPedantix.ok) {
  console.error(`status : ${respHistoryPedantix.status}`);
  console.error(`statusText : ${respHistoryPedantix.statusText}`);
  console.error(`Response : ${await respHistoryPedantix.text()}`);
  Deno.exit(1);
}

const historyPedantix: History = await respHistoryPedantix.json();

const historiqueFichier = JSON.parse(await Deno.readTextFile("history.json"));

const historiqueEntier = _.uniqBy(_.concat(historyPedantix, historiqueFichier), (element: Entry) => element[0]).filter(element => element[2][0] !== '');

await Deno.writeTextFile("history.json", JSON.stringify(historiqueEntier, null, 2));

const pages = historiqueEntier.map((page: Entry) => page[2][0]).filter(Boolean);

let tousLesMots: { [key: string]: number } = {};

// Fonction de retry avec délai exponentiel pour gérer le rate-limiting
async function fetchWithRetry(url: string, maxRetries = 3, delayMs = 1000): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url);

    if (response.ok) {
      return response;
    }

    // Si rate-limited ou erreur serveur, on retry
    if (response.status === 429 || response.status >= 500) {
      console.log(`Attempt ${attempt + 1} failed with status ${response.status}, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // Backoff exponentiel
      continue;
    }

    // Pour les autres erreurs, on échoue immédiatement
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}

// Petit délai entre chaque requête pour éviter le rate-limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

for (const page in pages) {
  // Délai de 200ms entre chaque requête pour éviter le rate-limiting
  await delay(200);

  const respWikipedia: Response = await fetchWithRetry(
    `https://fr.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${encodeURIComponent(pages[page])}`
  );

  // Vérifier que le content-type est bien JSON avant de parser
  const contentType = respWikipedia.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    console.error(`Unexpected content-type for page "${pages[page]}": ${contentType}`);
    console.error(`Response: ${await respWikipedia.text()}`);
    continue; // Skip cette page au lieu de crash
  }

  const respWikipediaJson: any = await respWikipedia.json();
  const pageId: string = Object.keys(respWikipediaJson.query.pages)[0];
  const mots: string[] = respWikipediaJson.query.pages[pageId].extract.toLowerCase().split(/[^\p{Letter}]+/gu).filter(Boolean);
  const motsOccurences: { [key: string]: number } = _.countBy(mots);

  if (!tousLesMots) {
    tousLesMots = motsOccurences;
  } else {
    for (const mot in motsOccurences) {
      if (tousLesMots[mot]) {
        tousLesMots[mot] += motsOccurences[mot];
      } else {
        tousLesMots[mot] = motsOccurences[mot];
      }
    }
  }
}

const mots = Object.entries(tousLesMots).sort(([, a], [, b]) => b - a).map(([mot,]) => `${mot}`,).slice(0, 100).join("\n");

await Deno.writeTextFile("mots.txt", mots);

const respStopwords: Response = await fetch("https://raw.githubusercontent.com/stopwords-iso/stopwords-fr/master/stopwords-fr.json");
const stopWords: string[] = await respStopwords.json();

const motsSansStopWords = Object.entries(tousLesMots).filter(([mot]) => !stopWords.includes(mot)).sort(([, a], [, b]) => b - a).map(([mot,]) => `${mot}`).slice(0, 100).join("\n");

await Deno.writeTextFile("mots_sans_stopwords.txt", motsSansStopWords);
