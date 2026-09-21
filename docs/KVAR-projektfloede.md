# Kvar att göra: projektflöde och vyer

Status efter steg 8 i `docs/HANDOVER-projektfloede.md`. Bakgrund och beslut finns i `docs/projektfloede.md`.

## Klart

- Lägesmodell och övergångar som ren logik med enhetstester (`projectMode.ts`, `npm test`).
- Bekräftelsedialog och gemensam header (läge, synlighet, spelarlänk, "Publiken ser nu", inline-rubrik).
- Projektlistan i full bredd, öppning styrd av läget.
- Livesändning: Before (statusrad, ingest, Before-meddelande, kolumner) och Live (sändningskontroll).
- Ondemand: After (meddelande, publicera, inspelning) och Ondemand (publicerat-markering, Gå till After).
- Gamla projektvyn och Playout borttagna.

## Steg 9: Projektinställningar

Panelen finns som skal i headern och visar bara projekt-id och skapad-datum. Kvar:

- Flytta in **Meeting-kopplingen** (`MeetingBindingModal.tsx` finns kvar och är oanvänd). `ProjectsView` behöver då få tillbaka `meetingDomain` som prop (togs ur destructuringen i steg 8, ligger kvar i interfacet).
- Bygg panelen som en plats som kan växa (player-layout med mera kommer senare). Inget arbete på innehåll som inte finns.
- Avgör var **Live- och Ondemand-texterna** ska redigeras. Idag går bara Before och After att redigera.

## Funktioner som försvann med detaljvyn

Ska var och en tillbaka, ersättas eller strykas?

- Granskningslänk (`client.projects.createReviewLink`).
- Publiceringshistorik (`publicationHistory` finns på projektet).
- "Visa livesändning" (spela upp live-flödet) och listan över IVS-sessioner för kanalen.
- Frågan om att riva ingest efter Live → After (ingest kan rivas i Before-arbetsytan).
- Länkar från projektet till dagordning/namnlista, med tillhörande oanvänt "pending"-tillstånd i `App.tsx` (`pendingAgendaId`, `pendingNameListId`, `onInitialSelectionConsumed`).

## Ondemand: ej implementerat (tydligt markerat i gränssnittet)

- Trimning direkt på tidslinjen ("Sätt start här", "Sätt slut här") och inbäddad förhandsvisning. Idag används trimdialogen och en lightbox.
- Nya kapitel och redigering av kapitel och talare. Backend har bara läsning (`GET /chapters`), och kapitel fryses vid publicering.
- Inspelningens egen längd och kapitel är oprövade mot riktiga data (mock-projekten saknar inspelningsdata).

## Öppna frågor från handovern

1. Ska "Playout" heta "Livesändning" i hela gränssnittet? Vyerna gör det redan; kontrollera resten (menyn, texter, dokumentation).
2. Behövs en manuell växling mellan Livesändning och Ondemand, utöver att läget styr? Ingen byggd.
3. Vad spelaren visar per läge och synlighet. Rörs inte i det här uppdraget.
4. Uttryckligt spara per ändring i Ondemand är utgångspunkten. Bekräfta.
5. Finns det en fördröjning innan ändringar når publiken? Operatören behöver i så fall få veta det.
6. Ska vyerna ha egna adresser som överlever omladdning? Idag styrs vyn av state och `localStorage`, adressen är alltid `#/projects`.
7. Ondemand-vyns fulla innehåll och verktyg.

## Beslut att bekräfta

- **Ondemand → Before kräver bekräftelse.** Tillägg utanför specens tabell, eftersom byte ur Ondemand alltid avpublicerar. Sex bekräftade övergångar i stället för fem.
- **Lägesbyten mot servern** (`modeChangePlan`): → Ondemand = `POST /publish`, Ondemand → After = `/unpublish`, Ondemand → Live = `/return-to-live`, Ondemand → Before = unpublish + `PUT /public-mode`, övriga `PUT /public-mode`. Backend är orörd; servern blockerar fortfarande Ondemand → Live via `PUT /public-mode` (`ondemand_to_live_requires_before`), så det får inte användas.
- **Publicering öppnar synligheten** (serverns beteende).
- **"SÄNDER" visas bara när signal tas emot**, annars "LIVE".
- **Mock-klienten:** `returnToLive` följer nu servern (läge Live, stängt). Avpublicering ligger i `unpublish`.

## Ej verifierat

- Hela flödet mot **riktiga backend** (allt har körts mot mock-klienten; `.env.local` pekar på en backend som inte kör lokalt).
- Publicering av en trimmad inspelning, trimning i dialogen, förhandsvisning och avpublicering med redigerat After-meddelande.
- Utspelning av talare och "Tillfällig talare", signalavbrott i Live, "Visa ingest-info" i Live, byt/koppla lista, import och "Riv ingest".
- Kopiering av länk till urklipp och papperskorgs-radering från listan.
- Bred skärm (bara smal panel har setts) och ljust tema (bara mörkt har setts).
- Tangentbord och skärmläsare: segmenterade kontroller har `aria-pressed` och ikonknappar har `aria-label`, men det är inte testat med hjälpmedel. Kontrast är inte uppmätt.

## Städning och småsaker

- `RenameModal` sparar inte med Enter (befintligt beteende, rörde inte).
- `PlayoutColumns.tsx` är en portad kopia av den gamla Playout-logiken. Alternativ: dela upp den i mindre delar när fler vyer behöver den.
- `contentLocked` finns kvar som prop i `Shell` men används inte längre av `App`.
- `.claude/launch.json` har en ny konfiguration `live-console-v3-mock` (startar mot mock-klienten). Behåll eller ta bort.
- `dist/` skrevs över av `npm run build` under steg 8.
- Inget är committat. Rekommenderad indelning i granskningsbara commits följer handoverns ordning: logik och tester, dialog och header, Livesändning, lista, Ondemand, borttagning.
