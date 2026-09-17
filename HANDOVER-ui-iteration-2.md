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

## Ordning

1. Avsnitt 1 (CSS-ändringen, liten och avgränsad) – gör detta först och verifiera i alla sju vyer.
2. Avsnitt 2 (bygg om Projekt-detaljen till `.doc .head/.body`, tools-raden i alla vyer).
3. Avsnitt 3 + 4 (Projekt-detaljens formulär och statuskort).
4. Avsnitt 5 i valfri ordning.

Verifiera varje steg i dark mode vid 1084 px och 1298 px bredd (båda använts under granskningen) samt i den smala
layouten med hamburgermeny (< ~800 px), där listan och detaljen staplas.
