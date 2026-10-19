# 🚆 Fahrpläne EU – Zugfahrpläne Europas

> Moderne, responsive Web-Applikation zur synchronen Fahrplanabfrage für Österreich mit Fokus auf die **Weststrecke** und den **Flughafen Wien-Schwechat**. Optimiert für Serverless-Hosting auf **Netlify**.

---

## 🌟 Highlights & Funktionen

- **Kumulative Betreiberabfrage**: Erfasst Züge von **ÖBB** (Railjet, Nightjet, ICE, IC, EC, CJX, REX, S-Bahn) und **WESTbahn** (WB 9xx) über eine HAFAS-/ÖBB-Scotty-kompatible Serverless-Schnittstelle.
- **Klare optische Kennzeichnung**:
  - 🔴 **ÖBB-Verbindungen**: Brand-Badge in ÖBB-Rot mit Zugprodukt (z. B. `RJX 560`).
  - 🔵 **WESTbahn-Verbindungen**: Brand-Badge in WESTbahn-Blau (z. B. `WB 954`).
  - 🟠 **Kombi-Verbindungen**: Dynamischer Indikator bei Umstiegen zwischen beiden Betreibern.
- **Echtzeitdaten & Pünktlichkeit**:
  - Live-Verspätungsanzeige in Minuten (`+X Min.`) oder grüne `Pünktlich`-Kennzeichnung.
  - Gleis- und Bahnsteigangaben für Abfahrt und Ankunft.
- **Schnellwahl & Autocomplete**:
  - 1-Klick-Auswahl für wichtige Knotenbahnhöfe: **Wien Hbf**, **Wien Westbahnhof**, **Flughafen Wien**, **Linz Hbf**, **Salzburg Hbf**, **St. Pölten Hbf**, **Wels Hbf**.
  - Intelligente Autovervollständigung mit Priorisierung österreichischer Bahnhöfe.
  - Schneller Bahnhofstausch (Start ⇄ Ziel) mit Rotationsanimation.
- **Detaillierter Fahrtverlauf**:
  - Ausklappbare Zeitleiste pro Verbindung.
  - Anzeige aller Zwischenhalte inklusive Ankunfts-/Abfahrtszeiten.
  - Umsteigezeiten und Fußweg-Angaben zwischen Bahnsteigen.
- **CORS-sichere Serverless-Architektur**: Browser-Abfragen greifen auf Netlify Functions zurück, wodurch CORS-Sperren vermieden werden.

---

## 🛠️ Tech-Stack

| Schicht | Technologie |
|---|---|
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+), Tailwind CSS (CDN), Lucide Icons |
| **Backend / API** | Node.js Serverless Functions auf Netlify (`@netlify/functions`) |
| **Fahrplandaten** | `hafas-client` mit ÖBB-Profil (`hafas-client/p/oebb`) |
| **Testing** | Node.js Test-Suite (`tests/fahrplan.test.js`) |
| **Hosting** | Netlify (Static Publish `public`, Functions in `netlify/functions`) |

---

## 📂 Projektstruktur

```
fahrplan/
├── .gitignore
├── netlify.toml                       # Netlify-Konfiguration (Functions, Redirects & Build)
├── package.json                       # Abhängigkeiten und npm-Skripte
├── README.md                          # Projektdokumentation
├── netlify/
│   └── functions/
│       ├── fahrplan.js                # Serverless Function: Fahrpläne & Umstiege
│       ├── stations.js                # Serverless Function: Bahnhofs-Autovervollständigung
│       └── utils/
│           └── carrierHelper.js       # Betreiber-Erkennung (ÖBB vs. WESTbahn)
├── public/
│   ├── index.html                     # Semantisches UI
│   ├── style.css                      # Design-System, Badges & Animationen
│   └── app.js                         # Frontend-Logik & DOM-Rendering
└── tests/
    └── fahrplan.test.js               # Automatisierte Test-Suite
```

---

## 🚀 Lokale Installation & Ausführung

### Voraussetzungen
- [Node.js](https://nodejs.org/) (Version 18+ empfohlen)
- npm

### 1. Repository klonen & Abhängigkeiten installieren
```bash
git clone https://github.com/<DEIN-USER>/fahrplan.git
cd fahrplan
npm install
```

### 2. Test-Suite ausführen
```bash
npm test
```

### 3. Netlify Dev Server starten
```bash
npm run dev
# oder
npx netlify dev
```
Die Anwendung ist standardmäßig unter `http://localhost:8899` (oder `http://localhost:8888`) erreichbar.

---

## 🌐 Bereitstellung auf Netlify

### Option 1: Automatisches Deployment über GitHub
1. Neues Repository auf GitHub erstellen und Code pushen (siehe unten).
2. Auf [Netlify](https://app.netlify.com/) einloggen und **"Add new site"** &rarr; **"Import an existing project"** wählen.
3. Dein GitHub-Repository auswählen.
4. Netlify liest automatisch die [`netlify.toml`](file:///c:/GitHubProjects/fahrplan/netlify.toml) aus:
   - **Publish directory**: `public`
   - **Functions directory**: `netlify/functions`
5. Klick auf **"Deploy Site"** – die App ist in ca. 30 Sekunden live!

### Option 2: Über die Netlify CLI
```bash
npx netlify login
npx netlify init
npx netlify deploy --prod
```

---

## 📋 Git / GitHub Synchronisation

```bash
# 1. Neues Repository auf GitHub anlegen (z. B. "fahrplan")
# 2. Remote hinzufügen:
git remote add origin https://github.com/<DEIN-USERNAME>/fahrplan.git

# 3. Main-Branch festlegen und pushen:
git branch -M main
git push -u origin main
```

---

## 📄 Lizenz & Hinweise

Entwickelt für Fahrgäste und Pendler in Österreich. Die Fahrplandaten basieren auf der öffentlichen HAFAS-Schnittstelle. ÖBB und WESTbahn sind eingetragene Markenzeichen der jeweiligen Betreiber.
