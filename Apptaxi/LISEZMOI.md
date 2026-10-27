# Carnet Taxi – Cannes

Carnet de bord pour taxi : courses **privées** et **médicales** (conventionné).
Application web installable sur iPhone, qui fonctionne hors ligne. Les données restent **uniquement sur le téléphone**.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page : formulaires, listes, onglets |
| `css/style.css` | L'apparence (thème sombre, gros boutons) |
| `js/app.js` | Le fonctionnement : ajout, modification, totaux, sauvegarde, CSV |
| `js/db.js` | Le stockage local sur le téléphone (IndexedDB) |
| `js/adresses.js` | Suggestions d'adresses et km par la route (services IGN gratuits) |
| `js/tarif-medical.js` | **Le futur calcul du prix médical** (vide pour l'instant) |
| `sw.js` | Le « service worker » : permet d'ouvrir l'app sans réseau |
| `manifest.json` | La carte d'identité de l'app (nom, icône, plein écran) |
| `icons/` | Les icônes |
| `serveur.ps1` + `lancer-serveur.bat` | Petit serveur pour tester sur le PC (rien à installer) |

Services externes utilisés (gratuits, sans clé, publics) :
- Adresses : `https://data.geopf.fr/geocodage/search` (Géoplateforme IGN, remplace l'ancienne API Adresse)
- Distance : `https://data.geopf.fr/navigation/itineraire` avec la ressource `bdtopo-valhalla`

Seule l'adresse tapée est envoyée à l'IGN pour obtenir les suggestions. Aucun nom ni téléphone n'est envoyé.

---

## Étape 1 – Tester sur le PC

1. Double-cliquez sur **`lancer-serveur.bat`**.
   Une fenêtre noire s'ouvre (c'est le serveur) et le navigateur ouvre `http://localhost:8080/`.
2. Pour voir l'app comme sur un iPhone, dans Chrome ou Edge : appuyez sur **F12**, puis **Ctrl + Maj + M**, et choisissez « iPhone » en haut.
3. Pour arrêter : fermez la fenêtre noire.

> N'ouvrez pas `index.html` directement par double-clic : le stockage et le mode hors ligne ont besoin de passer par le serveur.

Les données saisies sur le PC restent dans le navigateur du PC ; elles ne vont pas sur l'iPhone.

## Étape 2 – Tester sur l'iPhone

Sur iPhone, le mode hors ligne et l'installation ne marchent qu'avec une adresse **https://**. Le plus simple (et gratuit) est donc de mettre l'app en ligne sur GitHub Pages (étape 3), puis de l'ouvrir dans Safari.

## Étape 3 – Mettre en ligne sur GitHub Pages (gratuit)

### 3a. Créer un compte GitHub (si vous n'en avez pas)
1. Allez sur https://github.com/signup
2. Entrez votre e-mail, un mot de passe et un nom d'utilisateur (ex. `taxi-cannes-enzo`). Ce nom apparaîtra dans l'adresse de l'app.
3. Validez le code reçu par e-mail. Choisissez l'offre **Free**.

### 3b. Créer le dépôt (le « dossier en ligne »)
1. En haut à droite : **+** → **New repository**.
2. Nom : `carnet-taxi`. Cochez **Public** (obligatoire pour GitHub Pages gratuit).
   Le *code* sera visible publiquement, mais **vos courses ne le sont pas** : elles restent dans le téléphone.
3. Cliquez **Create repository**.

### 3c. Envoyer les fichiers
1. Sur la page du dépôt, cliquez le lien **uploading an existing file**.
2. Ouvrez le dossier du projet dans l'Explorateur Windows, sélectionnez **tout son contenu** (Ctrl + A : les fichiers *et* les dossiers `css`, `js`, `icons`) et glissez-le dans la page.
3. En bas, cliquez **Commit changes**.
4. Vérifiez que vous voyez bien `index.html` à la racine, et les dossiers `css`, `js`, `icons`.

### 3d. Activer GitHub Pages
1. Dans le dépôt : **Settings** → **Pages** (menu de gauche).
2. « Source » : **Deploy from a branch**. « Branch » : **main** et **/ (root)** → **Save**.
3. Attendez 1 à 2 minutes et rechargez la page : l'adresse s'affiche, du type
   `https://VOTRE-NOM.github.io/carnet-taxi/`

### 3e. Installer sur l'iPhone
1. Ouvrez cette adresse dans **Safari** (pas Chrome).
2. Touchez le bouton **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancez l'app depuis l'icône « Carnet Taxi ». Elle s'ouvre en plein écran.
4. Ouvrez-la une fois avec du réseau : ensuite elle s'ouvrira même sans réseau.

### Mettre à jour l'app plus tard
Renvoyez les fichiers modifiés (même méthode qu'en 3c). Sur l'iPhone, la nouvelle version apparaît **au 2ᵉ lancement** de l'app (le 1ᵉʳ la télécharge en arrière-plan).

---

## ⚠️ Important : vos données

- Elles sont stockées **dans l'app installée** sur l'iPhone. Si vous **supprimez l'icône**, les données sont effacées.
- L'app installée et Safari ne partagent pas les données : utilisez toujours l'icône.
- Faites **Sauvegarde → Exporter toutes les données** régulièrement, et choisissez « Enregistrer dans Fichiers » (iCloud Drive). Pour restaurer : **Sauvegarde → Restaurer depuis un fichier**.

---

## Pour plus tard : le simulateur coach-taxi.github.io

Analyse faite le 27/10/2026 du code source (un seul fichier `index.html`, dépôt `coach-taxi/coach-taxi.github.io`).

**Données utilisées**
- Une table de **tarif au km par département** (pour le **06 : 1,27 €/km**).
- Le nombre de passagers (transport partagé).
- Pour chaque passager : distance en km, et 3 cases : nuit/week-end/férié, retour à vide (hospitalisation), forfait « aire métropolitaine ».

**Formule codée par l'auteur**
1. Forfait de base **13 €** (comprend les 4 premiers km).
2. **+ 15 €** si forfait aire métropolitaine.
3. **+ (km − 4) × tarif du département**.
4. Retour à vide : **+25 %** de la part km si moins de 50 km, **+50 %** sinon.
5. Nuit / week-end / férié : **× 1,5** sur le total.
6. Transport partagé : **−23 %** (2 passagers), **−35 %** (3), **−37 %** (4 et plus).
7. Arrondi au centime.

**Limites remarquées** : les km sont tronqués à l'entier (7,9 km compte 7 km) ; pas de distinction Consultation / HDJ ; pas de gestion de l'aller/retour ; aucun lien vers les textes officiels. Les montants doivent donc être **vérifiés avec la convention CPAM officielle** (ameli.fr / Journal officiel) avant usage.

**Licence** : le dépôt **n'a aucune licence**. Par défaut, cela veut dire « tous droits réservés » : on **n'a pas le droit de copier son code**. En revanche, les **tarifs et règles** viennent de la convention nationale (ce sont des faits, pas protégés) : on pourra écrire **notre propre** `calculerPrixMedical()` à partir des textes officiels, en s'inspirant de la logique.
