# Carnet Taxi – Cannes

Carnet de bord pour taxi : courses **privées** et **médicales** (conventionné).
Application web installable sur iPhone, qui fonctionne hors ligne. Les données restent **uniquement sur le téléphone**.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page : feuille du jour, bouton +, formulaires, réglages |
| `css/style.css` | L'apparence (thème sombre, gros boutons) |
| `js/app.js` | Le fonctionnement : feuille du jour, ajout, modification, sauvegarde, CSV |
| `js/db.js` | Le stockage local sur le téléphone (IndexedDB) |
| `js/patients.js` | Les fiches patients : doublons, habitudes (valeurs les plus fréquentes) |
| `js/adresses.js` | Liste de suggestions, adresses et km par la route (services IGN gratuits) |
| `js/recherche-lieux.js` | Recherche de lieux par leur nom : 🏥 établissements, 🌐 lieux en ligne |
| `data/etablissements.json` | Les établissements de santé du 06, et les hôpitaux/cliniques du 83 et du 13 (fichier officiel FINESS) |
| `js/tarif-medical.js` | **Le futur calcul du prix médical** (vide pour l'instant) |
| `sw.js` | Le « service worker » : permet d'ouvrir l'app sans réseau |
| `manifest.json` | La carte d'identité de l'app (nom, icône, plein écran) |
| `icons/` | Les icônes |
| `serveur.ps1` + `lancer-serveur.bat` | Petit serveur pour tester sur le PC (rien à installer) |
| `outils/maj-etablissements.ps1` + `mettre-a-jour-etablissements.bat` | Met à jour la liste des établissements |

Services externes utilisés (gratuits, sans clé, publics) :
- Adresses : `https://data.geopf.fr/geocodage/search` (Géoplateforme IGN, remplace l'ancienne API Adresse)
- Distance : `https://data.geopf.fr/navigation/itineraire` avec la ressource `bdtopo-valhalla`
- Lieux en ligne (secours) : `https://photon.komoot.io/api/` (Photon, données © OpenStreetMap).
  Utilisé seulement si aucun établissement ne correspond, comme le demande sa règle « fair use ».
  Nominatim n'est **pas** utilisé : ses règles interdisent l'autocomplétion.

Seul le texte tapé dans les champs adresse est envoyé à ces services. Aucun nom ni téléphone de client n'est envoyé.

## Utilisation

- **Écran d'accueil = la feuille du jour** : total du jour, détail Privé / Médical, toutes les courses triées par heure (P = privé, M = médical).
- Flèches ‹ › : jour précédent / suivant. Toucher la date : un calendrier s'ouvre pour choisir le jour. « ↩ Aujourd'hui » (en petit, au-dessus) : retour à aujourd'hui.
- Toucher une course : la modifier ou la supprimer.
- Bouton **+** : nouvelle course Privé, Médical ou **Médical donné** (la date proposée est celle du jour affiché).
- **Médical donné** (pastille D) : course confiée à un collègue. Pas de prix, ne compte pas dans le total. ✓ Bon / ⚠ Sans bon indique si vous avez le bon de transport. Le nom et le numéro du taxi sont mémorisés et proposés la fois suivante ; « 📞 Appeler » dans le formulaire.
- **Statistiques** (icône à bâtons, à côté de la roue dentée) : vue Jour / Mois / Année avec flèches ‹ ›. Chiffre d'affaires (privé + médical, comparé à la période précédente), graphique en bâtons (toucher un jour ouvre sa feuille, toucher un mois le détaille), nombre de courses, kilomètres (courses médicales, aller/retour compté deux fois), prix moyen, jours travaillés, courses données, bons manquants, et répartition des paiements des courses privées.
- **Frais fixes** (Réglages → Gérer mes frais fixes) : assurance, licence, crédit… par mois ou par an (un frais annuel compte pour 1/12 chaque mois). Dans les Statistiques (vue Mois, ou Année avec les frais × 12), une barre de progression montre le chiffre d'affaires face aux frais : jaune tant qu'ils ne sont pas couverts (« Encore X € avant le bénéfice », et pour le mois en cours le montant à faire par jour restant), verte ensuite (« Bénéfice : +X € », avec le jour où les frais ont été couverts). Bénéfice = chiffre d'affaires − frais fixes.
- Roue dentée en haut à droite : sauvegarde, restauration, export CSV (Privé, Médical, Médical donné), **Mes collègues taxi** (modifier, supprimer).
- Les anciennes courses médicales sans heure sont classées à l'heure où elles ont été saisies.
- **Bon de transport (Médical)** : case « J'ai » ; si elle n'est pas cochée, un champ « Nom du taxi » apparaît à côté (collègues proposés). Sur la feuille : « ⚠ Sans bon » ou « ⚠ Bon : nom du taxi ». Les anciennes courses médicales, sans cette case, comptent comme « sans bon » jusqu'à ce qu'on la coche.
- **Filtre ⚠ Bons manquants** (en haut de la feuille) : toutes les courses Médical et Médical donné sans bon, tous jours confondus, groupées par date. Toucher les pastilles Médical / Donné pour n'afficher qu'un type. Le chiffre orange = nombre de bons à récupérer.

## Fiches patients (Médical)

- **Création automatique** : chaque course médicale enregistrée crée ou met à jour la fiche du patient (téléphone, adresse client, destination, trajet et prise en charge habituels, nombre de courses, dernière course, destinations déjà utilisées). « Habituel » = la valeur la plus fréquente sur ses courses.
- **Même patient** si le nom correspond (sans majuscules, accents ni espaces, dans n'importe quel ordre : « Jean Dupont » = « DUPONT jean ») ou si le téléphone est identique. Même nom avec un autre numéro : l'app demande (OK = même personne, Annuler = nouvelle fiche).
- **Formulaire Médical** : dès 2 lettres dans « Nom / Prénom », les patients connus sont proposés (👤). En choisir un remplit téléphone, adresses, trajet et prise en charge, et lance le calcul des km. Tout reste modifiable. Dans « Adresse d'arrivée », ses autres destinations (🕘) passent en premier.
- **Médical donné** : les patients connus sont aussi proposés dans « Nom / Prénom du patient ».
- **Réglages → Mes patients** : liste triée par dernière course, recherche, fiche modifiable, bouton Appeler, historique des courses. Supprimer une fiche ne supprime pas les courses.
- À l'installation de cette version, les fiches sont créées à partir des courses médicales déjà enregistrées (même nom ou même téléphone = même fiche, sans question). Une ancienne sauvegarde restaurée recrée aussi les fiches.

## Suggestions d'adresses (formulaire Médical)

Ordre d'affichage : 🏥 établissements de santé, 📍 adresses, 🌐 lieux en ligne.
- 🏥 = tous les établissements du 06, plus les hôpitaux, cliniques, SSR, centres de cancérologie et de dialyse du 83 et du 13 (ex. « timone », « sainte musse », « hopital nord », « frejus »). Les plus proches de Cannes passent en premier.
- 📍 adresses : le 06 d'abord, puis le 83 et le 13.
- La recherche ignore majuscules et accents, accepte les mots dans le désordre et les débuts de mots :
  « hop pasteur », « clinique st jean », « CH cannes », « dialyse antibes ».
- 🏥 marche **sans réseau**. Taper une adresse affiche aussi les établissements situés à cette adresse.
- Les cabinets de radiologie privés ne sont pas dans FINESS : ils sont trouvés en ligne (🌐).

### Mettre à jour la liste des établissements (tous les 2-3 mois)
Le fichier FINESS est publié environ tous les 2 mois sur data.gouv.fr.
1. Double-cliquez sur **`mettre-a-jour-etablissements.bat`** (environ 10 secondes, 50 Mo téléchargés).
2. Renvoyez le fichier `data/etablissements.json` sur GitHub.

Pour garder d'autres catégories (ex. pharmacies), ajoutez leur code dans la liste `$categories`
en haut de `outils/maj-etablissements.ps1`.

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
Demandez à Claude : il modifie, teste, envoie sur GitHub et vérifie. Sur l'iPhone, l'app se recharge toute seule quand une nouvelle version arrive (sauf si une saisie est en cours : elle apparaîtra au lancement suivant).

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
