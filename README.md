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

## Embed mode (ungap Shell)

The console can be framed by ungap Shell (UNG-322). It enters embed mode only when it is framed and the `shell` origin
in its address (`/?surface=projects&shell=https://…`) is allowed: `VITE_SHELL_ORIGINS` at build time (comma separated),
plus `https://localhost:5180` in development. A build without the variable (test and prod today) never embeds.

Embedded, the console hides its menu and account box, starts on the surface's view (`projects`, `jobs`; `status` is a
placeholder for Combined view's status strip) and takes language and theme from the shell without remembering them. It
talks to the shell through the shell API: `src/app/shellProtocol.ts` (a copy of ungap-shell's, keep them identical) and
`src/app/embed.ts`; the protocol is documented in `ungap-shell/docs/shell-api.md`.
