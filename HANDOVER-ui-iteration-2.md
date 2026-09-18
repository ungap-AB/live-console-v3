# Handover: Live Console – UI iteration 2 (dark mode, layout, konsekvens)

Appen: Ungap Live Console ("Presenter"), Vite-dev på `https://local.console.live.ungap.net:5173/`.
Dark mode-färgerna (tokens, knappar, fält) är redan åtgärdade i iteration 1 och ska inte röras.
Den här handovern gäller layout och konsekvens mellan vyer. Designunderlag finns i Claude-canvasen
"Live Console Dark Mode" (artboards: "Projekt – omarbetad layout (iteration 2)" samt "Tokens och komponenter").

Alla mått nedan är uppmätta i den körande appen med DevTools/JS, inte gissade.

---

## 1. Lista + detalj: samma layout i alla vyer

### Nuläge

Alla vyer bygger på samma grund:

```css
.view > .content { padding: 22px 26px; }
.split { display: grid; grid-template-columns: 296px 1fr; gap: 18px; height: 100%; }
.pane { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; … }
.doc  { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; … }
```

Projekt-vyn avviker genom två överrides som gör listan kant i kant och tar bort detaljens
topp-/bottenmarginal:

```css
.projects-view > .content { padding-left: 0; padding-top: 0; padding-bottom: 0; }
.project-list-pane { height: 100%; max-height: 100%; border: 0; border-right: 1px solid var(--line); border-radius: 0; }
.project-list-pane li .row { flex: 1 1 0%; width: auto; min-width: 0; }
.project-list-pane .meta-row { justify-content: space-between; }
.project-list-pane .row-date { font-size: 12px; color: var(--ink-3); flex: 0 0 auto; }
```

### Beslut

Projekt-listans utseende (kant i kant, endast höger kantlinje, full höjd) ska gälla **alla** list-paneler.
Detaljpanelen ska ha **lika stor marginal runt om** (22 px).
Ensamma paneler utan detalj (Papperskorg) behåller sitt kort med marginal runt om.

### Ändring (CSS)

Ta bort alla `.projects-view`- och `.project-list-pane`-regler och ersätt med:

```css
/* Vyer med lista + detalj (.split = 2 kolumner, .three = Användare) */
.view > .content:has(> .split, > .three) { padding: 0 22px 0 0; }
.split, .three { gap: 22px; }

.split > .pane:first-child,
.three > .pane:first-child {
  height: 100%;
  max-height: 100%;
  border: 0;
  border-right: 1px solid var(--line);
  border-radius: 0;
}

.split > :not(:first-child),
.three > :not(:first-child) { margin: 22px 0; }

/* Radlayouten från projektlistan blir standard för alla listor */
.pane li .row { flex: 1 1 0%; width: auto; min-width: 0; }
.pane .meta-row { justify-content: space-between; }
.pane .row-date { font-size: 12px; color: var(--ink-3); flex: 0 0 auto; }
```

Ändring (markup): ta bort klasserna `projects-view` och `project-list-pane` – de används inte längre.

Provkört live i Projekt, Dagordningar, Namnlistor, Live, Videoarkiv, Användare och Papperskorg – ser rätt ut i alla.

### Användare-vyn

`.three` har fasta kolumner `210px 260px 294px`; högerkolumnen fyller inte ut på bredare skärmar.
Sätt sista kolumnen till `1fr`: `grid-template-columns: 210px 260px 1fr;`.

### Acceptans

- Listpanelen i Projekt, Dagordningar, Namnlistor, Live, Videoarkiv och Användare (Domäner) ligger dikt an mot vänsterkant, header och botten, med endast höger kantlinje, ingen rundning.
- Detaljpanelen har 22 px till header, botten, lista och högerkant i samtliga vyer.
- Papperskorg ser ut som förut (kort med marginal runt om).
- Listrader har status-chip till vänster och datum till höger i alla listor.

---

## 2. Detaljpanelens huvud: samma komponent i alla vyer

### Nuläge

Namnlistor, Live och Videoarkiv använder samma struktur:

```html
<section class="doc">
  <div class="head">           <!-- padding: 16px 20px 14px; border-bottom: 1px solid var(--line-soft) -->
    <h2>…</h2>
    <div class="facts">…</div> <!-- 12.5px, --ink-3 -->
    <div class="tools">…</div> <!-- knappar, gap 8px, margin-top 14px, .spacer för högerställning -->
  </div>
  <div class="body">…</div>    <!-- padding: 14px 20px 20px -->
</section>
```

Projekt använder en egen struktur: `.panel-head` (padding 14px 18px) → `.title-row` (`.title` + `.title-actions` till höger)
→ `p.subtitle` → tre `.panel-head-row` med `.field-block` → `.tabs` → `.tabpanel`.
Resultat: rubrik, knappar och innehåll sitter på andra positioner än i övriga vyer (bl.a. 2 px olika indrag).

### Beslut

Projekt-detaljen byggs om till `.doc > .head` + `.doc > .body`, samma som de andra.
Åtgärdsknapparna ligger i `.head .tools` i alla vyer (h2 → facts → tools), och `.tools` ordnas enligt regeln:

- **Vänster:** navigering och icke-destruktiva åtgärder (t.ex. "Öppna playout", "Gå till projekt", "Trimma inspelning").
- **Primär** (`.btn-primary`) är nästa naturliga steg för objektet, max en per vy.
- **Höger (efter `.spacer`):** destruktiva åtgärder i en "…"-meny (`ib`-knapp med meny), inte som röd knapp i raden.

Fältblocken i Projekt (Spelarlänk, Synlighet, Dagordning, Namnlista) flyttar ner i `.body`, ovanför flikarna Live/Ondemand.

### Per vy (tools-raden)

| Vy | Primär | Vänster | "…"-meny |
|---|---|---|---|
| Projekt | Öppna för publik / Stäng för publik (toggle beroende på läge) | Öppna playout | Flytta till papperskorgen |
| Namnlistor | Redigera | Duplicera | Flytta till papperskorgen |
| Live-resurser | – | Öppna projektet, Rotera stream key | Riv resurs |
| Videoarkiv | Trimma inspelning (infotexten säger att det är nästa steg; "Ladda ner" är inte primär) | Ladda ner, Gå till projekt | Flytta till papperskorgen |
| Användare | Bjud in | Skicka återställningslänk | Inaktivera konto, Ta bort ("Inaktivera konto"/"Ta bort" är i dag ren text utan knappyta) |

### Acceptans

- `.doc .head` och `.doc .body` används i Projekt, Namnlistor, Live, Videoarkiv och Användare.
- h2 sitter på samma y-position och samma indrag (20 px) i alla vyer.
- Ingen röd knapp i tools-raden; destruktiva åtgärder finns i "…"-menyn med bekräftelse som i dag.
- "Flytta till papperskorgen" radbryter inte längre (Videoarkiv).

---

## 3. Formulärlayout: etikett över fält, åtgärd inuti fältet

Gäller Projekt-detaljen (och Live-resursers "Anslutning"). Se artboard "Projekt – omarbetad layout".

- Etikett **över** fältet (13 px, 500, `--ink-2`, gap 6 px), aldrig till vänster på samma rad. Fälten får då full bredd.
- Fält med tillhörande åtgärd renderas som ett fält där knappen ligger **inuti** till höger (`.btn-sm`, 4px 10px):
  - Dagordning: `[ Ingen kopplad ……………… Koppla… ]` – streckad kant när inget är kopplat.
  - Namnlista: `[ <namn> ……………… Öppna  ⇄ ]` (byt = ikonknapp med `aria-label="Byt namnlista"`).
  - Spelarlänk / Ingest-server / HLS-URL: `.copy-field` som i dag (mono, kopiera-ikon).
- Synlighet: segmenterat val (`.seg`) i full bredd med kort text "Öppen" / "Stängd", hjälptext under (12 px, `--ink-3`).
- Kopplingsfälten under Live ligger i två kolumner (Ingest-server | Stream key) och HLS-URL på egen rad.

---

## 4. Statuskort i Live-fliken

I dag: `[● Väntar på signal] | [Skapa ingest (disabled)] [Riv ingest] [Visa livesändning]` på en rad, plus två separata
rutor ("Inkommande signal", "Resursen är allokerad…").

Ny struktur, ett kort (`--rail`-bakgrund, 1px `--line-soft`, radius 8):

```
(●)  Väntar på signal                          [Visa livesändning] [Riv ingest]
     Ingest är skapad. Starta enkodern med uppgifterna nedan.
```

- Statusprick + rubrik + förklaring till vänster, knappar till höger.
- Endast de knappar som är giltiga i aktuellt läge visas. "Skapa ingest" visas bara när ingen ingest finns – aldrig som disabled bredvid "Riv ingest".
- "Riv ingest" som ghost-danger (transparent yta, `--danger`-text, `--danger-line`-kant).
- Lägen: ingen ingest → "Skapa ingest" (primär); väntar → som ovan; sänder → grön prick, "Visa livesändning" primär, "Riv ingest" i meny.
- "Inkommande signal": en yta (150 px hög, `#0b0d12`, kant `--line-soft`) med placeholder-text tills bild finns.
- Debug-raden (Simulera signal start/stopp, Återställ allt) läggs i en nedfälld `<details>` längst ner i fliken, rubrik "Debug".

---

## 5. Övriga småsaker per vy

- **Projektlistan:** ta bort "Playout"-knappen i raden (nås från detaljens tools). Raden = titel, status-chip, datum.
- **Live-resurser:** faktatabellen Status / Senast använd / Inspelning / Vilande har en tom fjärde cell → gör den 2×2 eller en rad med fyra.
- **Namnlistor:** två staplade verktygsrader (Redigera/Duplicera/Papperskorg över Filtrera/Sortera). Objekt-åtgärderna går till `.head .tools`; Filtrera + Sortera A–Ö + "Lägg till namn" blir en rad överst i `.body`. "Lägg till namn" ligger i dag längst ner under listan.
- **Användare:** chipsen "Aktiv" (status) och "Administratör/Operatör" (roller) blandas i samma rad → status i `.facts`, roller som chips.
- **Trimma-dialogen:** gör Start och Slut till två identiska rader: `Start [00:00:00] [Sätt här] [Hoppa]` / `Slut [00:07:00] [Sätt här] [Hoppa]`. Ta bort den fristående "Aktuell tid"-raden med "Sätt start här / Sätt slut här".
- **Mitt konto:** "Spara" i disabled-läge ser ut som ren text. Primärknapp i disabled behåller sin ljusa yta med lägre opacitet på ytan (inte på texten), enligt komponentarken.
- **Inloggning:** "Logga in" är ren text utan knappyta → `.btn-primary` i full bredd.
- **Listpanelens topp:** `.pane .top` (sök + knapp) radbryter till två rader i alla vyer utom Användare, där Domäner-panelen har rubrik + knapp på en rad. Välj ett mönster; förslag: sök på egen rad, knapp under, i alla.

---

---

## 6. Tillägg efter granskning av avsnitt 1 (uppmätt i appen 2026-09-17, 1408–1481 px bredd)

Avsnitt 1 är infört och ser rätt ut i alla vyer. Följande återstår eller uppstod.

### 6.1 Listrader blir för korta (Projekt, Videoarkiv)

Orsak: regeln `.pane li .row { flex: 1 1 0%; width: auto; min-width: 0 }` flyttades upp från `.project-list-pane`,
men `li` är `display: list-item` överallt (den gamla Projekt-listan hade `li { display: flex }`). `width: auto` slår
därför ut `width: 100%` från `.pane li button`, och en rad utan lång text blir bara så bred som sitt innehåll
(uppmätt: "Dark mode"-raden 114 px, raden ovanför 263 px).

Fix, ett av två:

```css
/* A – enklast: låt knappen fylla, ta bort .row-regeln */
.pane li .row { }                        /* ta bort width:auto / flex */
.pane li button { width: 100%; display: flex; flex-direction: column; gap: 3px; min-width: 0; }

/* B – om li ska kunna få syskon (t.ex. en ikonknapp till höger) */
.pane li { display: flex; align-items: stretch; gap: 4px; }
.pane li .row { flex: 1 1 0%; min-width: 0; }
```

### 6.2 Videoarkiv: underordnad (trimmad) rad rinner utanför panelen

Den indragna raden "… (trimmad)" klipps horisontellt: titeln och datumet går utanför panelens kant.
Ge den nästlade raden samma regler som toppnivån (`min-width: 0`; `.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }`)
och låt indraget vara `padding-left`, inte `margin-left` som adderas till 100 % bredd.

### 6.3 Användare: mittkolumnen

- `.three` är nu `236px 300px 1fr`. Mittpanelen (300 px) är för smal för raderna: `.uinfo` är `display: block` med två
  `inline; white-space: nowrap`-spans (`.un` namn, `.ue` roller) på samma rad → "Administratör, Operatör" klipps.
  Fix: `.uinfo { display: flex; flex-direction: column; min-width: 0; } .un, .ue { overflow: hidden; text-overflow: ellipsis; }`
  och ge kolumnen mer plats: `grid-template-columns: 236px 340px 1fr`.
- `.pane .top` har här `padding: 12px 14px` mot `12px` i övriga paneler → sätt samma.
- Sökfältet + "Ny"-knappen: se 6.5.

### 6.4 Trimma-dialogen: spara höjd

Uppmätt: dialog 648 px (max-height ≈ 90 vh), `.mhead` 79, `.mbody` 504, `.mfoot` 65. På en 768 px-skärm blir
video­ytan liten och dialogen scrollar. Ny ordning i `.mbody`, uppifrån:

1. **Inspelningssession** (select) på egen rad **ovanför videon**, etikett till vänster, select `flex: 1`.
2. **Video** – `flex: 1 1 0; min-height: 160px; object-fit: contain`, så det är videon som ger vika på låga skärmar, inte
   kontrollerna. `.mbody { display: flex; flex-direction: column; gap: 10px; min-height: 0 }`.
3. **En rad** för start och slut:
   `Start [00:00:00] [Sätt här] [Hoppa]   ·   Slut [00:07:00] [Sätt här] [Hoppa]   ·   Längd 00:07:00`
   (flex, gap 16, radbryter till två rader under ~640 px).
4. **Ta bort**: range-slidern med de två runda handtagen, raden "Aktuell tid 00:00:00" (visa aktuell tid i videons egna
   kontroller eller som liten mono-text bredvid "Sätt här"), och projektnamnet i `.mhead`-underraden
   ("Använd samma projekt flera gånger · original 00:07:00" → bara "Original 00:07:00", eller flytta in i Längd-texten).
5. `.mfoot`: "Längd efter trim" flyttas upp till raden i punkt 3, så foten bara har Avbryt / Spara. Höjd 65 → ~56.

Mål: hela dialogen ryms utan scroll vid 1280×720 med minst 160 px video.

### 6.5 Listpanelens topp: sök + knapp på en rad

`.pane .top` radbryter till två rader i alla vyer (sök 100 % bred, knapp under). Sätt i stället:

```css
.pane .top { display: flex; gap: 8px; flex-wrap: nowrap; }
.pane .top .search { flex: 1 1 0; min-width: 0; }
.pane .top .btn { flex: 0 0 auto; }
```

Sparar ~40 px höjd i varje lista och löser "sökrutan är för lång" på Användare. Knapptexterna ryms i 296 px
("Nytt projekt", "Ny resurs", "Ladda upp", "Ny"). Domäner-panelen (rubrik + Ny) är redan en rad.

### 6.6 Övrigt som dök upp

- **Live-resurser**: tom lista visar "Ingen resurs matchar sökningen." även när sökfältet är tomt. Skilj på
  "inga resurser ännu" (med "Ny resurs"-uppmaning) och "inget matchar sökningen".
- **Videoarkiv**: detaljpanelen stod på "Laddar…" i över fem sekunder efter klick på en rad utan att något hände.
  Kontrollera att laddningen inte hänger när HLS-manifest saknas, och visa ett felmeddelande i stället för evig "Laddar…".
- **Projekt**: knapparna "Öppna…"/"Byt…" i Dagordning/Namnlista är nu inne i fältet (bra), men "Byt…" bör vara en
  ikonknapp (⇄, `aria-label`) så att fältet får plats med långa namn – se avsnitt 3.
- **Projekt, Ondemand**: "Publicera" är primär medan "Trimma inspelning" är sekundär, fast statuschippen säger
  "Granskas". Låt primärknappen följa läget: Ej publicerad → Trimma; Granskas → Publicera; Publicerad → Avpublicera i meny.

---

## 7. Granskning vy för vy (Anders, 2026-09-18) – gäller före avsnitt 2–6 där de krockar

Gemensamt mönster som följer av punkterna nedan: **sökrutan och "Ny"-knappen försvinner från alla listpaneler**
(`.pane .top` tas bort helt; listan börjar direkt under headern). "Skapa ny" flyttar till **vyns header, till höger om h1**
(`.view > header`: h1 + `.spacer` + `.btn.btn-sm`), och underrubriken (`.sub`) tas bort i alla vyer.
Detta ersätter 6.5 och sök-delen av 6.3. Rubriken på objektet i detaljpanelen redigeras via **penn-ikon direkt till
höger om h2** (samma `ib`-mönster som Projekt har i dag), inte via en "Redigera"-knapp.

### Sidomenyn (listvyn)

1. Knappen vid "Projekt" ska heta **"+ Nytt"** (inte "+ Ny").

### Projekt

1. Ta bort sökrutan och "Nytt projekt" överst i listpanelen. Lägg **"Nytt projekt"** till höger om rubriken "Projekt" i headern.
2. Ta bort den vita knappen "Stäng för publik" (den primära toggle-knappen i tools-raden). Synlighet styrs enbart via
   segment-valet i formuläret. → Ersätter raden "Projekt" i tabellen i avsnitt 2: Projekt har ingen primärknapp i tools.
3. "Öppna playout" flyttar till **övre högra hörnet** av detaljpanelen och heter **"[play-ikon] Playout"**.

### Dagordningar

1. Ta bort sökrutan och "Ny" överst i listpanelen. Lägg **"+ Ny"** till höger om rubriken "Dagordningar".
2. Ta bort underrubriken "Mallar som kan läggas in i projekt".
3. Penn-ikon till höger om dagordningens rubrik (h2) för att redigera rubriken.
4. Ta bort knapparna "Redigera" och "Gör till mall".
5. "Gör till mall" läggs i "…"-menyn.

### Namnlistor

1. Ta bort sökrutan och "Ny" överst i listpanelen. Lägg **"+ Ny"** till höger om rubriken "Namnlistor".
2. Ta bort underrubriken "Mallar som kan läggas in i projekt".
3. "Duplicera" läggs i "…"-menyn.
4. Penn-ikon till höger om namnlistans rubrik (h2) för att redigera rubriken.
5. Ta bort knapparna "Redigera" och "Duplicera".

### Live-resurser

1. Ta bort sökrutan och "Ny resurs" överst i listpanelen. Lägg **"+ Ny"** till höger om rubriken "Live-resurser".
2. Ta bort underrubriken "Allokerade IVS-kanaler, med eller utan kopplat projekt".
3. Ta bort kvot-rutan ("0 av 20 kanaler", sänder/vilande) längst ner i listpanelen.

### Videoarkiv

1. Ta bort sökrutan och "Ladda upp" överst i listpanelen. Lägg **"+ Ny"** till höger om rubriken "Videoarkiv".
2. Ta bort underrubriken "Originalinspelningar och trimmade versioner".
3. "Ladda upp" läggs på samma rad som "Ladda ner" i detaljpanelens tools.

### Papperskorg

1. Ta bort underrubriken "Borttaget material som ännu går att återställa".

### Användare (uppmätt 2026-09-18)

1. **Poster i listorna renderas fel** – innehållet centrerat och staplat vertikalt (avatar över namn, "kalmar.se / Kalmar kommun / 1"
   på tre rader). Orsak: fixen 6.1 A (`.pane li button { display: flex; flex-direction: column }`) slår nu på användar- och
   domänraderna, som är byggda som rader (avatar + text, domän + namn + räknare). Fix:

   ```css
   .pane li button { display: flex; flex-direction: column; align-items: stretch; text-align: left; gap: 3px; }
   .pane li button.urow, .pane li button.drow { flex-direction: row; align-items: center; gap: 10px; }   /* användare, domän */
   .uinfo { display: flex; flex-direction: column; min-width: 0; flex: 1 1 0; }
   .un, .ue { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
   ```
   (klassnamnen `urow`/`drow` är förslag – använd de som finns på raderna.) Domänradens "…"-knapp ska ligga till höger i raden,
   inte utanför den.
2. **Listan flödar över i underkant och hela detaljvyn skrollar.** Uppmätt: `.content` 691 px hög men `scrollHeight` 713;
   mittpanelen är 691 px (får `height: 100%` från en `.pane`-regel) och får dessutom `margin: 22px 0` från regeln i avsnitt 1 →
   22 px för mycket. Tredje kolumnen är korrekt (647 = 691 − 44). Fix:

   ```css
   .split > :not(:first-child), .three > :not(:first-child) { margin: 22px 0; height: auto; min-height: 0; }
   .split, .three { grid-template-rows: minmax(0, 1fr); }
   ```
   och ta bort `height: 100%` från den vy-specifika regeln på mittpanelen. Efter det ska bara `ul` i mittpanelen och `.body`
   i detaljpanelen skrolla, aldrig `.content`.
3. Detaljpanelens "…"-knapp radbryter till egen rad under "Skicka återställningslänk" / "Bjud in". Tools-raden: `flex-wrap: nowrap`,
   "…" sist efter `.spacer`, och låt "Skicka återställningslänk" få `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` eller
   kortare text ("Återställningslänk").

### Projekt › Playout (uppmätt 2026-09-18)

Headern är trasig: chippen "Ingen ingest", projektnamnet och ordet "Playout" ligger som löpande inline-text
("● Ingen ingest Dark modePlayout"), stäng-krysset hamnar på egen rad under, och panelen har `padding: 0`.
Orsak: Playout-vyn använder fortfarande den gamla Projekt-strukturen `.panel-head > .title-row > .title` + `.subtitle`,
men CSS-reglerna för `.title-row`, `.title` och `.subtitle` finns inte längre (togs bort när Projekt byggdes om till `.doc .head`).

Fix: bygg om Playout-huvudet till samma `.doc .head`-struktur som övriga detaljpaneler:

```html
<div class="head">
  <h2>Dark mode <span class="chip chip-neutral">Ingen ingest</span></h2>
  <div class="facts"><span>Playout</span></div>
  <div class="tools">
    <div class="copy-field">…spelarlänk…</div>
    <span class="spacer"></span>
    <div class="seg">…Öppen/Stängd för publik…</div>
    <button class="ib" aria-label="Stäng playout">×</button>   <!-- eller i .head uppe till höger, absolut placerad -->
  </div>
</div>
```

Ta samtidigt bort alla kvarvarande `.panel-head`, `.title-row`, `.title`, `.subtitle`, `.panel-head-row`-användningar
(`grep` i markupen) så att inget annat ställe ärver samma fel.

### Konsekvenser för tidigare avsnitt

- Avsnitt 2, tabellen: Projekt = ingen primär, "Playout" uppe till höger, "Flytta till papperskorgen" i "…"-menyn.
  Dagordningar/Namnlistor = inga vänsterknappar; "Gör till mall" resp. "Duplicera" + "Flytta till papperskorgen" i "…"-menyn.
  Videoarkiv = "Trimma inspelning" primär, "Ladda ner" + "Ladda upp" till vänster, papperskorg i menyn.
- Avsnitt 6.5 utgår (ingen `.pane .top` längre). Avsnitt 6.3: behåll fixen för `.uinfo` och kolumnbredden; sökrutan
  i mittpanelen tas bort som i övriga vyer och "Ny" flyttar upp till Användare-headern.
- "…"-menyn behövs nu i alla detaljpaneler: gör den till en gemensam komponent (`ib`-knapp + meny, Esc stänger,
  destruktiva val sist med `--danger`-text och bekräftelse).

---

## Ordning

1. Avsnitt 1 – **klart**. Gör 6.1 och 6.2 direkt (små CSS-fixar på samma ställe).
2. Avsnitt 7 (header-knapp, borttagen sök/underrubrik, penn-ikon, "…"-meny) – ett svep över alla vyer.
3. Avsnitt 6.3 (Användare, `.uinfo` och kolumnbredd).
4. Avsnitt 6.4 (Trimma-dialogen).
5. Avsnitt 2 (bygg om Projekt-detaljen till `.doc .head/.body`, tools-raden i alla vyer, med ändringarna från avsnitt 7).
6. Avsnitt 3 + 4 (Projekt-detaljens formulär och statuskort).
7. Avsnitt 5 och 6.6 i valfri ordning.

Verifiera varje steg i dark mode vid 1084 px och 1298 px bredd (båda använts under granskningen) samt i den smala
layouten med hamburgermeny (< ~800 px), där listan och detaljen staplas.
