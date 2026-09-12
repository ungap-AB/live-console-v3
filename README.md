# live-console-v3

Ny operatörskonsol för Ungap Live — avsedd att ersätta `live-console` och `live-console-v2`.

## Status

Under uppbyggnad som en fristående klickbar mockup, utan API-koppling och utan automatiska tester. Se `mockup/HANDOVER.md` för domänmodell och `mockup/API-ENDPOINTS.md` för det tilltänkta API-kontraktet.

Vyerna byggs i den ordning som beskrivs i planeringsdokumentet: Dagordningar → Namnlistor → Videoarkiv → Live-resurser → Papperskorg → Användare → Projekt/Playout.

## Kom igång

```bash
npm install
npm run dev
```

## Bygg

```bash
npm run build
npm run preview
```
