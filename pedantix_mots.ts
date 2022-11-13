import _ from "https://deno.land/x/lodash@4.17.15-es/lodash.js";

const respPedantix: Response = await fetch("https://cemantix.certitudes.org/pedantix/history");
let pages: any[] = await respPedantix.json();
pages = pages.map((page) => page[2][0]).filter(Boolean);

let tousLesMots: { [key: string]: number } = {};

for (const page in pages) {
  const respWikipedia: Response = await fetch(`https://fr.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${pages[page]}`);
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
