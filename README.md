# pedantix_mots

> Répertorie les mots les plus utilisés sur le jeu [pedantix](https://cemantix.certitudes.org/pedantix)

[![Update words list](https://github.com/AnthonyJungmann/pedantix_mots/actions/workflows/words_list.yml/badge.svg?branch=master)](https://github.com/AnthonyJungmann/pedantix_mots/actions/workflows/words_list.yml)
[![Made with Deno](https://img.shields.io/badge/Deno-1.24-blue?logo=deno&logoColor=white)](https://deno.land)

## Liste des mots

- [mots.txt](mots.txt) Répertorie les 100 mots les plus utilisés
- [mots_sans_stopwords.txt](mots_sans_stopwords.txt) Répertorie les 100 mots les plus utilisés, sans stopwords ([mot vide](https://fr.wikipedia.org/wiki/Mot_vide))

Ces deux listes sont mises à jour hebdomadairement, via le workflow [Update words list](https://github.com/AnthonyJungmann/pedantix_mots/actions/workflows/words_list.yml)

## Comment lancer

```bash
deno run --allow-net --allow-write pedantix_mots.ts
```
