let respPedantix = await fetch("https://cemantix.herokuapp.com/pedantix/history");
let pages = (await respPedantix.json()) as any[];
pages = pages.map(page => page[2][0]).filter(Boolean);

let tousLesMots: {[key: string]: number} = {};

for (var page in pages) {
  let respWikipedia = await fetch(`https://fr.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro&explaintext&redirects=1&titles=${pages[page]}`);
  let respWikipediaJson = await respWikipedia.json();
  let pageId = Object.keys(respWikipediaJson.query.pages)[0];
  let mots = respWikipediaJson.query.pages[pageId].extract.toLowerCase().replaceAll(/\.|'|:|\(|\)|,|’|\/|«|»|(\\[\w]+)|=|{|(\w*})|¯|;/g, ' ').split(/\s+/).filter(Boolean);
  let motsOccurences: {[key: string]: number} = mots.reduce((p, mot) => {
    if (!p.hasOwnProperty(mot)) {
      p[mot] = 0;
    }
    p[mot]++;
    return p;
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

console.log(Object.entries(tousLesMots).filter(mot => mot[1] > 0).sort(([,a],[,b]) => b-a).map(foo => `${foo[0]} ${foo[1]}`).slice(0, 100).join('\n'));