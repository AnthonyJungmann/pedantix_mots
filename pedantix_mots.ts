let respPedantix: Response = await fetch("https://cemantix.herokuapp.com/pedantix/history");
let pages: any[] = await respPedantix.json();
pages = pages.map(page => page[2][0]).filter(Boolean);

let tousLesMots: {[key: string]: number} = {};

for (var page in pages) {
  let respWikipedia: Response = await fetch(`https://fr.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${pages[page]}`);
  let respWikipediaJson: any = await respWikipedia.json();
  let pageId: string = Object.keys(respWikipediaJson.query.pages)[0];
  let mots: string[] = respWikipediaJson.query.pages[pageId].extract.toLowerCase().split(/[^\p{Letter}]+/gu).filter(Boolean);
  let motsOccurences: {[key: string]: number} = mots.reduce((acc, mot) => {
    if (!acc.hasOwnProperty(mot)) {
      acc[mot] = 0;
    }
    acc[mot]++;
    return acc;
  }, {});
  if (!tousLesMots) {
    tousLesMots = motsOccurences;
  } else {
    for (let mot in motsOccurences) {
      if (tousLesMots[mot]) {
        tousLesMots[mot] += motsOccurences[mot];
      } else {
        tousLesMots[mot] = motsOccurences[mot];
      }
    }
  }
}

console.log(Object.entries(tousLesMots).sort(([,a],[,b]) => b-a).map(motAvecNombreOccurences => `${motAvecNombreOccurences[0]} ${motAvecNombreOccurences[1]}`).slice(0, 100).join('\n'));