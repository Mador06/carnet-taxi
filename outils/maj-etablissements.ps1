# ============================================================
# maj-etablissements.ps1
# Met à jour data/etablissements.json à partir du fichier
# FINESS officiel (data.gouv.fr, Licence Ouverte).
# 06 : tous les établissements utiles au taxi.
# Départements voisins (83, 13) : hôpitaux et cliniques seulement.
# Lancement : double-cliquez sur "mettre-a-jour-etablissements.bat".
# Rien à installer : utilise uniquement Windows PowerShell.
# ============================================================

param(
  [string]$Departement = '06',                 # département principal : toutes les catégories
  [string[]]$Voisins = @('83', '13')           # départements voisins : hôpitaux et cliniques
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$racine = Split-Path $PSScriptRoot -Parent
$sortie = Join-Path $racine "data\etablissements.json"
$departements = @($Departement) + $Voisins
$culture = [Globalization.CultureInfo]::InvariantCulture

# ---------- Catégories FINESS gardées (code -> nom affiché) ----------
# Pour ajouter une catégorie : ajoutez une ligne ici et relancez le script.
$categories = @{
  '101' = 'Hôpital';  '355' = 'Hôpital';  '106' = 'Hôpital'
  '292' = 'Hôpital psychiatrique'
  '161' = 'Clinique psychiatrique'
  '365' = 'Clinique'; '128' = 'Clinique'; '129' = 'Clinique'; '630' = 'Clinique'
  '109' = 'Soins de suite (SSR)'
  '362' = 'Soins longue durée'
  '131' = 'Cancérologie'; '294' = 'Cancérologie'
  '141' = 'Dialyse'; '146' = 'Dialyse'
  '611' = 'Laboratoire'; '610' = 'Laboratoire'; '612' = 'Laboratoire'
  '124' = 'Centre de santé'; '636' = 'Centre de santé'
  '603' = 'Maison de santé'
  '617' = 'Soins non programmés'
  '347' = "Centre d'examens de santé"
  '156' = 'CMP'; '189' = 'CMPP'
  '500' = 'EHPAD'; '502' = 'EHPAD'
  '202' = 'Résidence autonomie'
  '207' = 'Accueil de jour'
  '255' = 'Établissement handicap'; '448' = 'Établissement handicap'
  '183' = 'Établissement enfants handicapés'; '188' = 'Établissement enfants handicapés'; '192' = 'Établissement enfants handicapés'
  '126' = 'Thermes'
}

# Catégories gardées pour les départements voisins
$categoriesVoisins = @('Hôpital', 'Hôpital psychiatrique', 'Clinique psychiatrique', 'Clinique',
  'Soins de suite (SSR)', 'Cancérologie', 'Dialyse')

# ---------- Abréviations des types de voie ----------
$typesVoie = @{
  'AV' = 'Avenue'; 'R' = 'Rue'; 'BD' = 'Boulevard'; 'CHE' = 'Chemin'; 'CHEM' = 'Chemin'
  'RTE' = 'Route'; 'PL' = 'Place'; 'QUA' = 'Quartier'; 'QU' = 'Quai'; 'ALL' = 'Allée'
  'IMP' = 'Impasse'; 'PROM' = 'Promenade'; 'VOI' = 'Voie'; 'SQ' = 'Square'; 'CRS' = 'Cours'
  'COR' = 'Corniche'; 'ZI' = 'ZI'; 'ZA' = 'ZA'; 'ZAC' = 'ZAC'; 'RES' = 'Résidence'; 'PTE' = 'Porte'
  'PAS' = 'Passage'; 'VAL' = 'Vallon'; 'TRA' = 'Traverse'; 'RPT' = 'Rond-point'; 'RLE' = 'Ruelle'
  'PLAN' = 'Plan'; 'LD' = 'Lieu-dit'; 'GARE' = 'Gare'; 'COUR' = 'Cour'; 'CARR' = 'Carrefour'
  'CAR' = 'Carrefour'; 'MTE' = 'Montée'; 'ESP' = 'Esplanade'; 'HAM' = 'Hameau'; 'DOM' = 'Domaine'
  'LOT' = 'Lotissement'; 'SEN' = 'Sentier'; 'CITE' = 'Cité'; 'PARC' = 'Parc'
}
$complementsNumero = @{ 'B' = 'bis'; 'T' = 'ter'; 'Q' = 'quater' }

# ---------- Mise en forme des noms (MAJUSCULES -> Majuscules) ----------
$sigles = @('CH','CHU','CHR','CHS','HP','HJ','CMP','CMPP','CSAPA','EHPAD','UDM','IME','MAS','FAM','SSR',
  'MSP','CPTS','IRC','UAD','FSEF','E3S','AGAHTIR','IUFC','CATTP','ESAT','SELARL','SELAS','SAS','SARL',
  'LBM','EFS','PACA','APHM','AP-HM','CHI','CHITS','ADPC','IEM','SAMSAH','SSIAD','USLD','HPNCL','CTRE','ZI','ZA','ZAC','CEDEX','BP','CS','UGECAM','ORSAC','ARS')
$petitsMots = @('de','du','des','la','le','les','et','en','sur','sous','a','au','aux')

function Mettre-EnForme([string]$texte, [switch]$Suite) {
  # -Suite : le texte suit un autre mot (ex. après "Avenue"), donc "DE" -> "de"
  $mots = ($texte -replace '\s+', ' ').Trim().Split(' ')
  $resultat = for ($i = 0; $i -lt $mots.Count; $i++) {
    $mot = $mots[$i]
    if ($mot -eq '') { continue }
    if ($sigles -contains $mot) { $mot; continue }
    $bas = $mot.ToLower()
    $pasPremier = ($i -gt 0) -or $Suite
    if ($pasPremier -and $petitsMots -contains $bas) { $bas; continue }
    # D'OXFORD -> d'Oxford ; SAINT-JEAN -> Saint-Jean
    $parties = $bas -split "(['\-])"
    ($parties | ForEach-Object {
      if ($_ -eq "d" -or $_ -eq "l") { if ($pasPremier) { $_ } else { $_.ToUpper() } }
      elseif ($_.Length -gt 0 -and $_ -notmatch "^['\-]$") { $_.Substring(0,1).ToUpper() + $_.Substring(1) }
      else { $_ }
    }) -join ''
  }
  return ($resultat -join ' ')
}

# ---------- Lambert-93 (EPSG:2154) -> GPS (WGS84), formule IGN ----------
function Lambert93-VersGPS([double]$x, [double]$y) {
  $n = 0.7256077650532670; $c = 11754255.4260960; $xs = 700000.0; $ys = 12655612.0498760
  $e = 0.0818191910428158; $lon0 = 3.0 * [Math]::PI / 180
  $dx = $x - $xs; $dy = $y - $ys
  $r = [Math]::Sqrt($dx * $dx + $dy * $dy)
  $gamma = [Math]::Atan($dx / -$dy)
  $lon = $lon0 + $gamma / $n
  $latIso = -1 / $n * [Math]::Log([Math]::Abs($r / $c))
  $lat = 2 * [Math]::Atan([Math]::Exp($latIso)) - [Math]::PI / 2
  for ($k = 0; $k -lt 10; $k++) {
    $s = $e * [Math]::Sin($lat)
    $lat = 2 * [Math]::Atan([Math]::Pow((1 + $s) / (1 - $s), $e / 2) * [Math]::Exp($latIso)) - [Math]::PI / 2
  }
  return @([Math]::Round($lat * 180 / [Math]::PI, 5), [Math]::Round($lon * 180 / [Math]::PI, 5))
}

# ---------- 1. Trouver la dernière version du fichier ----------
Write-Host "Recherche de la dernière version du fichier FINESS sur data.gouv.fr..."
$jeu = Invoke-RestMethod 'https://www.data.gouv.fr/api/1/datasets/53699569a3a729239d2046eb/'
# cs1100507 = la version "géolocalisée" (avec coordonnées)
$ressource = $jeu.resources |
  Where-Object { $_.format -eq 'csv' -and $_.url -match 'cs1100507' } |
  Sort-Object last_modified -Descending | Select-Object -First 1
if (-not $ressource) { throw "Fichier FINESS géolocalisé introuvable sur data.gouv.fr." }
Write-Host ("  -> " + $ressource.title)

# ---------- 2. Télécharger ----------
$temporaire = Join-Path ([IO.Path]::GetTempPath()) 'finess-etablissements.csv'
Write-Host "Téléchargement (environ 50 Mo, patientez)..."
(New-Object Net.WebClient).DownloadFile($ressource.url, $temporaire)

# ---------- 3. Lire (UTF-8, ou ancien format Windows-1252) ----------
$lignes = [IO.File]::ReadAllLines($temporaire, [Text.Encoding]::UTF8)
if (($lignes[0..2000] -join "`n").Contains([char]0xFFFD)) {
  $lignes = [IO.File]::ReadAllLines($temporaire, [Text.Encoding]::GetEncoding(1252))
}

# Coordonnées : lignes "geolocalisation;numero;X;Y;source...;date"
$coordonnees = @{}
foreach ($ligne in $lignes) {
  if (-not $ligne.StartsWith('geolocalisation;')) { continue }
  $c = $ligne.Split(';')
  if ($departements -notcontains $c[1].Substring(0, 2)) { continue }
  if ($c.Count -ge 5 -and $c[4] -match 'EPSG:2154' -and $c[2] -and $c[3]) {
    $coordonnees[$c[1]] = Lambert93-VersGPS ([double]::Parse($c[2], $culture)) ([double]::Parse($c[3], $culture))
  }
}

# Établissements : lignes "structureet;..." (voir la notice FINESS cs1100507)
$etablissements = New-Object System.Collections.ArrayList
foreach ($ligne in $lignes) {
  if (-not $ligne.StartsWith('structureet;')) { continue }
  $c = $ligne.Split(';')
  if ($c.Count -lt 22 -or $departements -notcontains $c[13]) { continue }
  $categorie = $categories[$c[18]]
  if (-not $categorie) { continue }
  if ($c[13] -ne $Departement -and $categoriesVoisins -notcontains $categorie) { continue }
  if ($c[3] -match 'SMUR' -or $c[4] -match 'SMUR') { continue }   # antennes SMUR : pas des lieux d'accueil

  $nomCourt = Mettre-EnForme $c[3]
  $nom = if ($c[4]) { Mettre-EnForme $c[4] } else { $nomCourt }

  # Adresse : numéro + bis/ter + type de voie + nom de voie (+ lieu-dit)
  $type = if ($typesVoie.ContainsKey($c[8])) { $typesVoie[$c[8]] } else { Mettre-EnForme $c[8] }
  $numero = (@($c[7], $complementsNumero[$c[10]]) | Where-Object { $_ }) -join ' '
  $rue = (@($numero, $type, (Mettre-EnForme $c[9] -Suite)) | Where-Object { $_ }) -join ' '
  $lieuDit = if ($c[11] -and $c[11] -notmatch '^(BP|CS|TSA|CEDEX)\b') { Mettre-EnForme $c[11] } else { '' }
  $adresse = (@($rue, $lieuDit) | Where-Object { $_ }) -join ', '

  # Ville : "06414 CANNES CEDEX" -> "Cannes" (le code CEDEX n'est pas un vrai code postal)
  $acheminement = $c[15].Trim()
  $ville = Mettre-EnForme (($acheminement -replace '^\d{5}\s*', '') -replace '\s+CEDEX.*$', '')
  if ($acheminement -notmatch 'CEDEX' -and $acheminement -match '^(\d{5})') { $ville = $matches[1] + ' ' + $ville }

  $e = [ordered]@{ id = $c[1]; d = $c[13]; n = $nom }
  if ($nomCourt -ne $nom) { $e.a = $nomCourt }
  if ($c[5]) { $e.cpl = Mettre-EnForme $c[5] }
  $e.c = $categorie
  $e.adr = $adresse
  $e.v = $ville
  if ($coordonnees.ContainsKey($c[1])) { $e.lat = $coordonnees[$c[1]][0]; $e.lon = $coordonnees[$c[1]][1] }
  [void]$etablissements.Add($e)
}

# ---------- 4. Écrire le fichier JSON de l'app ----------
$resultat = [ordered]@{
  source = 'FINESS - data.gouv.fr (Licence Ouverte Etalab)'
  fichier = $ressource.title
  genereLe = (Get-Date -Format 'yyyy-MM-dd')
  departements = $departements
  etablissements = $etablissements
}
New-Item -ItemType Directory -Force (Split-Path $sortie) | Out-Null
$json = $resultat | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText($sortie, $json, (New-Object Text.UTF8Encoding $false))
Remove-Item $temporaire -ErrorAction SilentlyContinue

Write-Host ""
Write-Host ("Terminé : {0} établissements écrits dans {1}" -f $etablissements.Count, $sortie) -ForegroundColor Green
Write-Host ("  dont {0} sans coordonnées GPS" -f @($etablissements | Where-Object { -not $_.Contains('lat') }).Count)
$etablissements | Group-Object { $_.d } | Sort-Object Name |
  ForEach-Object { Write-Host ("  {0,4}  département {1}" -f $_.Count, $_.Name) }
$etablissements | Group-Object { $_.c } | Sort-Object Count -Descending |
  ForEach-Object { Write-Host ("  {0,4}  {1}" -f $_.Count, $_.Name) }
