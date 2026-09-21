# Handover till code-läget: projektflöde och vyer i live-console-v3

Det här dokumentet är skrivet till den Claude-session som ska implementera. Det är ett uppdrag och en spec, inte en bakgrundstext. Bakgrunden och motiveringarna finns i `docs/projektfloede.md`.

## Läs först

1. `docs/projektfloede.md` – besluten och varför de togs. Om något i det här dokumentet är oklart avgör den filen.
2. `docs/design/` – sju skärmar: Projektlista, Livesändning i Before, Livesändning i Live, Ondemand i After, Ondemand i Ondemand, samt bekräftelserna Live → After och Ondemand → After.
3. Dagens kod för projektvyn och Playout-vyn. Det här dokumentet är skrivet utan insyn i repot. Kartlägg därför först vilka komponenter, routes, stores och API-anrop som finns, och redovisa kartläggningen innan du ändrar något.

Designen visar struktur, innehåll och tillstånd. Följ repots befintliga komponenter, stilar och tokens där sådana finns, hellre än att kopiera mockupens exakta pixlar. Avsnittet Designtokens nedan gäller bara där repot saknar motsvarighet.

## Uppdraget i korthet

- Projektets detaljvy tas bort. Flikarna Live och Ondemand i den försvinner med den.
- Varje projekt får två vyer: **Livesändning** (dagens Playout, utökad med förberedelser) och **Ondemand** (ny).
- Båda vyerna får en **gemensam header**.
- Projektlistan blir en ensam lista i full bredd.
- Projektet får ett **läge** med fyra värden som operatören sätter manuellt, utöver den befintliga synligheten.

## Domänmodell

### Läge

`Before | Live | After | Ondemand`

Läget beskriver vad spelaren visar. Operatören sätter det manuellt. Det får aldrig härledas ur eller låsas av signal- eller ingeststatus: operatören ska kunna gå till Live utan signal och ligga kvar i Before med signal.

After är ett giltigt slutläge. Många projekt når aldrig Ondemand. Inget i gränssnittet får framställa After som ofärdigt, och lägesväljaren får inte se ut som en förloppsmätare.

Kontrollera om läget redan finns i backend och datamodell. Om det saknas: stanna och stäm av med Anders innan du inför det. Hitta inte på ett API.

### Synlighet

`Öppen | Stängd`, oberoende av läge. Stängd visar ingenting för publiken oavsett läge. Öppen visar det läget säger. Finns redan i dagens app.

### Meddelanden

Before och After har varsitt redigerbart meddelande som visas för publiken i respektive läge. Standardtexten för After ska inte lova en ondemand, eftersom den kanske aldrig kommer. Förslag: "Tack för att du tittade." Kontrollera om fälten finns i backend. Samma regel som ovan gäller om de saknas.

### Vad publiken ser

Härleds och visas i headern under "Publiken ser nu":

| Synlighet | Läge | Text |
|---|---|---|
| Stängd | alla | Inget (stängd) |
| Öppen | Before | Before-meddelandet |
| Öppen | Live | Livesändningen |
| Öppen | After | After-meddelandet |
| Öppen | Ondemand | Inspelningen |

## Lägesbyten

Alla byten är tillåtna, även bakåt och över flera steg. Vissa kräver bekräftelse. Principen är att bekräftelse krävs när bytet tar bort eller ändrar något publiken redan ser.

| Från → Till | Bekräftelse | Dialogens innehåll |
|---|---|---|
| Before → Live | Nej | – |
| Live → After | **Ja** | "Avsluta livesändningen?" Visar After-meddelandet, redigerbart |
| After → Ondemand | Nej | – |
| Ondemand → After | **Ja** | "Avpublicera inspelningen?" Visar After-meddelandet, redigerbart |
| After → Live | **Ja** | Säger att publiken åter ser livesändningen |
| Ondemand → Live | **Ja** | Säger att inspelningen tas bort från spelaren |
| Live → Before | **Ja** | Säger att den pågående sändningen bryts för publiken |
| Övriga | Nej tills vidare | Stäm av med Anders om du hittar ett fall som känns riskabelt |

Krav på bekräftelsen:

- Texten ska säga konkret vad som händer för publiken. Aldrig bara "Är du säker?".
- När målläget är After visar dialogen After-meddelandet i ett textfält. Operatören kan ändra det, och ändringen sparas tillsammans med lägesbytet.
- Avbryt lämnar allt orört.

Implementera övergångarna som en ren funktion eller tabell, till exempel `requiresConfirmation(from, to)`, så att reglerna går att enhetstesta utan gränssnitt.

Synlighetsbyten kräver ingen bekräftelse.

## Komponenter

### Gemensam header

Identisk i båda vyerna. Två rader.

Rad 1:
- Tillbakaknapp "Projekt" (hör egentligen till lagret, men ligger på samma rad).
- Projektets rubrik, redigeras inline via pennan.
- Ingång till Projektinställningar.

Rad 2:
- **Lägesväljare.** Segmenterad kontroll med fyra knappar. Aktivt läge markerat. Live är det enda som markeras rött.
- **Synlighet.** Segmenterad kontroll Öppen / Stängd. Öppen grön, Stängd neutral. Rött är reserverat för Live.
- **Spelarlänk.** Kompakt, utan protokoll, med kopiera och öppna i ny flik.
- **Publiken ser nu.** Härledd text enligt tabellen ovan.

Ska inte ligga i headern: ingest- och signalstatus, klocka, kopplingar.

### Projektinställningar

En panel eller dialog som nås från headern. Innehåller tills vidare Meeting-kopplingen och projektets id och skapad-datum. Bygg den som en plats som kan växa, eftersom player-layout med mera kommer senare. Lägg inget arbete på innehåll som inte finns än.

### Bekräftelsedialog

En komponent som tar rubrik, brödtext, åtgärdsknappens text och ett valfritt meddelandefält. Används av alla bekräftade lägesbyten.

## Vyerna

### Presentation

Båda vyerna lägger sig som ett lager över projektlistan och expanderar, på samma sätt som Playout gör idag. Vänstermenyn ska vara kvar och nåbar. Läget avgör vilken vy som öppnas när man väljer ett projekt: Before och Live öppnar Livesändning, After och Ondemand öppnar Ondemand.

När läget byts över gränsen mellan vyerna (till exempel Live → After) ska vyn följa med. Behovet av en manuell växling mellan vyerna är en öppen fråga; bygg ingen sådan utan avstämning.

### Livesändning

Dagens Playout med headern ovanpå. Under headern beror innehållet på läget.

**I Before** – arbetsyta för förberedelser:
- En passiv statusrad med fem poster: Dagordning, Namnlista, Ingest, Signal, Spelare. Varje post visar klart eller inte klart och ett kort värde. Raden är information, aldrig tvingande steg. Kopplingarna är frivilliga.
- Ingest: "Skapa ingest" när den saknas, annars ingest-uppgifterna (server, stream key, HLS-URL) via "Visa ingest-info". Flytta hit det som idag ligger i projektvyns Live-flik, så att ingesten bara hanteras på ett ställe.
- Before-meddelandet, redigerbart med uttryckligt Spara.
- Dagordning och namnlista i två kolumner som idag. Koppla och byt görs i kolumnens rubrikrad. Okopplad kolumn visar ett tomt läge med "Koppla …" och ska inte se ut som ett fel.
- Klocka.

**I Live** – ren sändningskontroll:
- Statusraden, ingest-rutan och Before-meddelandet visas inte.
- Tydlig markering att det sänds, signalstatus, klocka, och "Visa ingest-info" nedtonad.
- Ärende i bild och Talare i bild, framträdande.
- Kolumnerna med utspelning. Raden som är i bild markeras.

Utspelningslogiken ska inte ändras. Det här uppdraget gäller strukturen runt den.

### Ondemand

Ny vy. Dess fulla innehåll är inte genomgånget ännu, så bygg skalet och det som är beslutat, och markera resten tydligt som ej implementerat i stället för att gissa.

**I After** – arbetsyta:
- After-meddelandet, redigerbart med uttryckligt Spara.
- Knappen "Publicera ondemand", som är en genväg till lägesbytet After → Ondemand.
- Inspelning med förhandsvisning, trimning av start och slut, och en lista över kapitel och talare som kommer från livesändningen.

**I Ondemand** – förvaltningsyta:
- En tydlig markering att inspelningen är publicerad och att sparade ändringar syns direkt för publiken.
- Genväg "Gå till After" för större ändringar. Den går via samma bekräftelse som lägesväljaren.
- Samma redigeringsytor som i After.

Ingen utkast- eller versionshantering. Små ändringar görs direkt mot det publicerade. Större ändringar görs genom att operatören själv går till After. Systemet klassificerar inte ändringar och tvingar inte fram avpublicering.

Kontrollera vad backend stöder för trimning och kapitelredigering innan du bygger de delarna. Finns det inget stöd: bygg skalet, lämna ytorna som tydliga platshållare och rapportera vad som saknas.

### Projektlistan

- Endast lista, full bredd. Ingen detaljpanel till höger.
- Per rad: rubrik, datum, läge, synlighet, "Kopiera länk" och en åtgärdsmeny (byt namn, duplicera, papperskorg – i den mån funktionerna finns idag).
- Klick på raden öppnar den vy som läget pekar ut.
- "+ Nytt projekt" som idag.

## Tas bort

- Projektets detaljvy, inklusive flikarna Live och Ondemand.
- Dubbletten av ingest-hanteringen i projektvyn.
- Synlighet, spelarlänk och rubrikredigering i projektvyn, eftersom de flyttar till headern.

Ta inte bort kod förrän ersättningen fungerar. Lista i din slutrapport vad som togs bort.

## Designtokens

Används bara där repot saknar egna. Värdena kommer från mockupen.

| Roll | Värde |
|---|---|
| Bakgrund | `#0f1420` |
| Sidomeny | `#0b101a` |
| Panel | `#161b27` |
| Upphöjd yta | `#1d2433` |
| Kantlinje | `#2a3244` |
| Text | `#e8ebf2` |
| Dämpad text | `#9aa3b8` |
| Länk och accent | `#8ab4ff` |
| Live och destruktivt | `#d13438` med vit text |
| Öppen och publicerad | `#3fbf85` med mörk text `#06140d` |
| After i listan | `#f0b95a` |

Regler: rött betyder bara Live eller en destruktiv handling. Kontroller är riktiga `button`, `a`, `input` och `label`. Ikonknappar har `aria-label`. Segmenterade kontroller använder `aria-pressed`. Textkontrast minst 4,5:1.

## Föreslagen ordning

1. Kartlägg dagens kod och redovisa. Stäm av vad backend har för läge, meddelanden, trimning och kapitel.
2. Lägesmodellen och övergångstabellen som ren logik, med enhetstester.
3. Bekräftelsedialogen.
4. Den gemensamma headern, inkopplad i dagens Playout.
5. Livesändning: förberedelserna i Before, den rena vyn i Live, och flytten av ingest-hanteringen.
6. Projektlistan i full bredd, med öppning styrd av läget.
7. Ondemand-vyns skal med After-meddelande, publicering och markeringen för publicerat läge.
8. Ta bort detaljvyn.
9. Projektinställningar.

Gör varje steg som en egen, granskningsbar ändring.

## Öppna frågor – bygg inte på gissningar

1. Ska "Playout" byta namn till "Livesändning" i gränssnittet? Mockupen använder Livesändning.
2. Behövs en manuell växling mellan de två vyerna, utöver att läget styr?
3. Vad spelaren visar i varje kombination av läge och synlighet tas i ett senare resonemang. Rör inte spelaren i det här uppdraget.
4. Sparande i Ondemand-vyn: uttryckligt spara per ändring är utgångspunkten, eftersom ändringar i läget Ondemand går direkt till publiken. Bekräfta innan du bygger.
5. Finns det en fördröjning innan ändringar slår igenom hos publiken? I så fall behöver operatören få veta det.
6. Ska vyerna ha egna adresser som överlever omladdning? Idag ligger adressen kvar på projektlistan när Playout är öppen.
7. Ondemand-vyns fulla innehåll och verktyg.

## Arbetssätt

- Fråga Anders när en öppen fråga blockerar dig. Gissa inte.
- Ändra inte backend, API-kontrakt eller spelaren utan avstämning.
- Håll dig till uppdraget. Refaktorera inte sådant som inte berörs.
- Texter i gränssnittet är på svenska. Lägesnamnen Before, Live, After och Ondemand är etablerade sedan femton år och översätts inte.
