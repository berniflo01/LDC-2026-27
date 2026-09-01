// ============================================================
// Code.gs — Challenge Ligue des Champions (backend Apps Script)
// ============================================================
// A coller dans un projet Apps Script lié au Google Sheet du challenge.
//
// A FAIRE AVANT LE PREMIER LANCEMENT (authentification par hash) :
// Fichier > Propriétés du projet > Propriétés du script > ajouter une
// clé SECRET_KEY avec une valeur aléatoire longue (sert à signer les
// tokens de connexion, ne la partage jamais). Puis lancer une fois
// migrerMotsDePasseExistants() pour créer les hash des joueurs déjà
// présents dans le Sheet.
//
// Structure attendue du Sheet (voir plan validé) :
//   - Feuille "Joueurs"          : ID_Joueur, Nom, Prenom, MotDePasse, Token,
//                                  Admin, Paye, ParticipeHR, PayeHR,
//                                  Rang_Actuel, Rang_Precedent, Rang_Actuel_HR,
//                                  Rang_Precedent_HR (ces 4 dernières gérées
//                                  par le script, ne pas remplir à la main —
//                                  Rang_Precedent(_HR) est le point de
//                                  référence des flèches ▲▼, figé au coup
//                                  d'envoi de chaque nouvelle journée)
//   - Feuille "Matchs"           : ID_Match, Phase, Journee, Equipe_Domicile,
//                                  Equipe_Exterieur, Date_Heure, Cote_1, Cote_N,
//                                  Cote_2, Type_Prono, Score_Dom, Score_Ext, Statut
//   - Feuille "Pronos"           : ID_Match, ID_Joueur, Prono_1N2, Prono_Score_Dom,
//                                  Prono_Score_Ext, Points_Gagnes
//   - Feuille "PronosSpeciaux"   : ID_Joueur, Finaliste_1 (vainqueur), Finaliste_2
//                                  (l'autre finaliste), Buteur, Points_Gagnes
//   - Feuille "Config"           : Cle, Valeur (ex: PREMIER_COUP_ENVOI,
//                                  VAINQUEUR_REEL, FINALISTE_REEL, BUTEUR_REEL —
//                                  les 2 premières sont déduites automatiquement
//                                  du score de la finale saisi dans Matchs ;
//                                  BUTEUR_REEL est saisi par l'admin via l'action
//                                  enregistrerButeurReel, ce qui déclenche le
//                                  calcul des points spéciaux)
//   - Feuille "Equipes"          : Nom, Cote (cote "atteindre la finale")
//   - Feuille "Buteurs"          : Nom, Cote
//   - Feuille "SideBets"         : ID_Joueur1, ID_Joueur2, Mise, Commentaire

const SHEET_ID = '17fksBY6uZYyOmVQeyRKkQgzrWUR5_xEf_JUiPVO6JyA';
const PHASES_SCORE_EXACT = ['barrages', '8e', '4e', '1-2', 'finale'];

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function feuille_(nom) { return ss_().getSheetByName(nom); }

// --- Utilitaires génériques lecture/écriture par objets ---
// Reconnaît VRAI/FAUX, oui/non, TRUE/FALSE, vrai booléen... peu importe
// la casse ou la langue utilisée dans la Sheet. Un simple !!valeur
// traiterait "non"/"FAUX" comme vrai (chaîne non vide), d'où ce filtre.
function estVrai_(valeur) {
  if (valeur === true) return true;
  const t = String(valeur).trim().toLowerCase();
  return t === 'vrai' || t === 'oui' || t === 'true' || t === '1';
}

// Google Sheets convertit silencieusement "1"/"2" en nombres (mais
// garde "N" en texte). On force en chaîne à la lecture pour éviter les
// comparaisons foireuses ("1" !== 1 en JS).
function texte_(valeur) {
  if (valeur === '' || valeur === null || valeur === undefined) return '';
  return String(valeur);
}

function lireLignes_(nomFeuille) {
  const feuille = feuille_(nomFeuille);
  const donnees = feuille.getDataRange().getValues();
  const entetes = donnees.shift();
  return donnees.map((ligne, i) => {
    const obj = { _ligne: i + 2 }; // +2 : 1-based + ligne d'en-tête
    entetes.forEach((cle, j) => obj[cle] = ligne[j]);
    return obj;
  });
}

function ecrireValeur_(nomFeuille, numLigne, nomColonne, valeur) {
  const feuille = feuille_(nomFeuille);
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  const col = entetes.indexOf(nomColonne) + 1;
  if (col === 0) throw new Error('Colonne inconnue : ' + nomColonne);
  feuille.getRange(numLigne, col).setValue(valeur);
}

// Ajoute une ligne en écrivant chaque valeur dans la bonne colonne par
// nom d'en-tête (pas par position) — robuste si l'ordre des colonnes du
// Sheet a été réorganisé à la main. `valeurs` = { NomColonne: valeur }.
function ajouterLigneParNoms_(nomFeuille, valeurs) {
  const feuille = feuille_(nomFeuille);
  const entetes = feuille.getRange(1, 1, 1, feuille.getLastColumn()).getValues()[0];
  const ligne = entetes.map(entete => (entete in valeurs) ? valeurs[entete] : '');
  feuille.appendRow(ligne);
}

// --- Point d'entrée HTTP ---
function doGet(e) {
  return traiter_(e.parameter.action, e.parameter);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  return traiter_(body.action, body);
}

function traiter_(action, params) {
  let resultat;
  try {
    switch (action) {
      case 'connexion': resultat = connexion_(params); break;
      case 'moi': resultat = moi_(params); break;
      case 'joueurs': resultat = listeJoueurs_(); break;
      case 'equipes': resultat = listeEquipes_(); break;
      case 'buteurs': resultat = listeButeurs_(); break;
      case 'matchsJournee': resultat = matchsJournee_(params); break;
      case 'enregistrerProno': resultat = enregistrerProno_(params); break;
      case 'enregistrerSpeciaux': resultat = enregistrerSpeciaux_(params); break;
      case 'speciauxJoueur': resultat = speciauxJoueur_(params); break;
      case 'ajouterJoueur': resultat = ajouterJoueur_(params); break;
      case 'supprimerJoueur': resultat = supprimerJoueur_(params); break;
      case 'recupererCotesAdmin': resultat = recupererCotesJournee_(params); break;
      case 'historiqueJoueur': resultat = getHistoriqueJoueur_(params); break;
      case 'enregistrerButeurReel': resultat = enregistrerButeurReel_(params); break;
      case 'pronosDesAutres': resultat = pronosDesAutres_(params); break;
      case 'sideBets': resultat = sideBets_(); break;
      case 'classement': resultat = classement_(); break;
      case 'classementHR': resultat = classementHR_(); break;
      default: throw new Error('Action inconnue : ' + action);
    }
  } catch (err) {
    resultat = { erreur: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(resultat))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Utilitaires sécurité (fidèles à Utils.gs de Challenge L1) ---
// Le mot de passe n'est JAMAIS vérifié en clair : hash SHA-256 + sel,
// stockés dans les propriétés du script (clés hash_<id>/sel_<id>),
// jamais dans le Sheet en tant que source de vérité (même si la
// colonne MotDePasse garde une copie en clair pour référence admin,
// comme sur L1 — seul le hash compte pour l'authentification).
const TOKEN_VALIDITE_JOURS = 90;

function getSecretKey_() {
  const cle = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');
  if (!cle) throw new Error('SECRET_KEY manquante dans les propriétés du script (Fichier > Propriétés du projet).');
  return cle;
}

function genererSel_() {
  return Utilities.getUuid();
}

function hashMotDePasse_(motDePasse, sel) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, motDePasse + ':' + sel);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

function signer_(texte) {
  const digest = Utilities.computeHmacSha256Signature(texte, getSecretKey_());
  return Utilities.base64EncodeWebSafe(digest);
}

// Token signé (payload base64 + signature HMAC), auto-suffisant : pas
// besoin de relire le Sheet pour vérifier une session, juste la
// signature et la date d'expiration.
function creerToken_(idJoueur) {
  const expiration = Date.now() + TOKEN_VALIDITE_JOURS * 24 * 60 * 60 * 1000;
  const payload = JSON.stringify({ idJoueur: idJoueur, exp: expiration });
  const payloadB64 = Utilities.base64EncodeWebSafe(payload);
  return payloadB64 + '.' + signer_(payloadB64);
}

function verifierSignatureToken_(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const [payloadB64, signature] = token.split('.');
  if (signer_(payloadB64) !== signature) return null; // signature invalide, ou falsifiée
  const payload = JSON.parse(Utilities.base64DecodeWebSafe(payloadB64).map(c => String.fromCharCode(c < 0 ? c + 256 : c)).join(''));
  if (Date.now() > payload.exp) return null; // expiré
  return { idJoueur: payload.idJoueur };
}

// --- Authentification ---
function connexion_(p) {
  const joueurs = lireLignes_('Joueurs');
  const joueur = joueurs.find(j => String(j.ID_Joueur) === String(p.idJoueur));
  if (!joueur) return { erreur: 'Nom ou mot de passe incorrect.' };

  const props = PropertiesService.getScriptProperties();
  const hashActuel = props.getProperty('hash_' + joueur.ID_Joueur);
  if (!hashActuel) return { erreur: 'Mot de passe non défini pour ce joueur — contacte l\'admin.' };

  const sel = props.getProperty('sel_' + joueur.ID_Joueur);
  if (hashMotDePasse_(p.motDePasse, sel) !== hashActuel) {
    return { erreur: 'Nom ou mot de passe incorrect.' };
  }

  return { token: creerToken_(joueur.ID_Joueur), idJoueur: joueur.ID_Joueur, admin: estVrai_(joueur.Admin) };
}

function verifierToken_(token) {
  const verif = verifierSignatureToken_(token);
  if (!verif) throw new Error('Session invalide, reconnecte-toi.');
  const joueurs = lireLignes_('Joueurs');
  const joueur = joueurs.find(j => String(j.ID_Joueur) === String(verif.idJoueur));
  if (!joueur) throw new Error('Session invalide, reconnecte-toi.');
  return joueur;
}

function moi_(p) {
  const joueur = verifierToken_(p.token);
  return { idJoueur: joueur.ID_Joueur, nom: joueur.Nom, admin: estVrai_(joueur.Admin) };
}

function listeJoueurs_() {
  return lireLignes_('Joueurs').map(j => ({ id: j.ID_Joueur, nom: j.Nom, prenom: j.Prenom }));
}

// --- Équipes et buteurs (pour les selects des pronos spéciaux) ---
// Feuille "Equipes" : colonne Nom, une ligne par équipe des 36.
// Feuille "Buteurs" : colonnes Nom, Cote — remplie et tenue à jour à la
// main par l'admin (cotes prises chez un bookmaker), pas de source API.
function listeEquipes_() {
  return lireLignes_('Equipes').map(e => ({ nom: e.Nom, cote: e.Cote }));
}

function listeButeurs_() {
  return lireLignes_('Buteurs').map(b => ({ nom: b.Nom, cote: b.Cote }));
}

// ============================================================
// Historique — journal d'audit des tentatives de prono (litiges)
// ============================================================
// Feuille "Historique" : Horodatage, ID_Joueur, ID_Match, Journee,
// Valeur_Tentee, Valeur_Precedente, Statut, Heure_Limite.
function loguerHistorique_(idJoueur, idMatch, journee, valeurTentee, valeurPrecedente, statut, heureLimite) {
  feuille_('Historique').appendRow([new Date(), idJoueur, idMatch, journee, valeurTentee, valeurPrecedente, statut, heureLimite]);
}

function getHistoriqueJoueur_(p) {
  const admin = verifierToken_(p.token);
  if (!estVrai_(admin.Admin)) return { erreur: 'Réservé aux admins.' };

  const lignes = lireLignes_('Historique')
    .filter(l => String(l.ID_Joueur) === String(p.idJoueurCible))
    .map(l => ({
      horodatage: l.Horodatage,
      idMatch: l.ID_Match,
      journee: l.Journee,
      valeurTentee: l.Valeur_Tentee,
      valeurPrecedente: l.Valeur_Precedente,
      statut: l.Statut,
      heureLimite: l.Heure_Limite,
    }))
    .sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));

  return lignes;
}

// --- Matchs ---
function matchsJournee_(p) {
  const matchs = lireLignes_('Matchs').filter(m => Number(m.Journee) === Number(p.journee));
  const maintenant = new Date();

  let idJoueur = null;
  if (p.token) {
    try {
      const joueur = verifierToken_(p.token);
      idJoueur = p.idJoueurCible || joueur.ID_Joueur;
    } catch (err) { /* token invalide : pas de comptage, tant pis */ }
  }
  const pronosJoueur = idJoueur ? lireLignes_('Pronos').filter(pr => String(pr.ID_Joueur) === String(idJoueur)) : [];

  return matchs.map(m => {
    const prono = pronosJoueur.find(pr => String(pr.ID_Match) === String(m.ID_Match));
    const pronostique = m.Type_Prono === 'ScoreExact'
      ? !!(prono && prono.Prono_Score_Dom !== '')
      : !!(prono && prono.Prono_1N2);
    return {
      id: m.ID_Match,
      phase: m.Phase,
      domicile: m.Equipe_Domicile,
      exterieur: m.Equipe_Exterieur,
      dateHeure: m.Date_Heure,
      typeProno: m.Type_Prono, // '1N2' ou 'ScoreExact'
      verrouille: new Date(m.Date_Heure) <= maintenant,
      enCours: m.Statut === 'en_cours',
      termine: m.Statut === 'termine',
      scoreDom: (m.Statut === 'en_cours' || m.Statut === 'termine') && m.Score_Dom !== '' ? m.Score_Dom : null,
      scoreExt: (m.Statut === 'en_cours' || m.Statut === 'termine') && m.Score_Ext !== '' ? m.Score_Ext : null,
      pronostique,
    };
  });
}

// --- Pronos ---
// Verrou : sans ça, 2 clics rapprochés peuvent tous les deux ne pas
// "voir" le prono de l'autre (aucune ligne encore écrite au moment du
// contrôle), et créer 2 lignes pour le même joueur+match.
function enregistrerProno_(p) {
  const verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(10000);
  } catch (e) {
    return { erreur: 'Serveur occupé, réessaie dans un instant.' };
  }
  try {
    return enregistrerProno__(p);
  } finally {
    verrou.releaseLock();
  }
}

function enregistrerProno__(p) {
  const joueur = verifierToken_(p.token);
  let idJoueurCible = joueur.ID_Joueur;
  let saisiParAdmin = false;
  if (p.idJoueurCible) {
    if (!estVrai_(joueur.Admin)) return { erreur: 'Réservé aux admins pour saisir au nom d\'un autre joueur.' };
    idJoueurCible = p.idJoueurCible;
    saisiParAdmin = true;
  }

  const matchs = lireLignes_('Matchs');
  const match = matchs.find(m => String(m.ID_Match) === String(p.idMatch));
  if (!match) throw new Error('Match introuvable.');

  const pronos = lireLignes_('Pronos');
  const existant = pronos.find(pr => String(pr.ID_Match) === String(p.idMatch) && String(pr.ID_Joueur) === String(idJoueurCible));
  const valeurTentee = match.Type_Prono === 'ScoreExact' ? `${p.scoreDom}-${p.scoreExt}` : p.prono1n2;
  const valeurPrecedente = existant
    ? (match.Type_Prono === 'ScoreExact' ? `${existant.Prono_Score_Dom}-${existant.Prono_Score_Ext}` : existant.Prono_1N2)
    : '';
  const heureLimite = new Date(match.Date_Heure);

  if (heureLimite <= new Date()) {
    loguerHistorique_(idJoueurCible, p.idMatch, match.Journee, valeurTentee, valeurPrecedente, 'refuse_verrouille', heureLimite);
    return { erreur: 'Ce match est verrouillé.' };
  }

  if (match.Type_Prono === 'ScoreExact') {
    if (existant) {
      ecrireValeur_('Pronos', existant._ligne, 'Prono_Score_Dom', p.scoreDom);
      ecrireValeur_('Pronos', existant._ligne, 'Prono_Score_Ext', p.scoreExt);
    } else {
      feuille_('Pronos').appendRow([p.idMatch, idJoueurCible, '', p.scoreDom, p.scoreExt, '']);
    }
  } else {
    if (existant) {
      ecrireValeur_('Pronos', existant._ligne, 'Prono_1N2', p.prono1n2);
    } else {
      feuille_('Pronos').appendRow([p.idMatch, idJoueurCible, p.prono1n2, '', '', '']);
    }
  }

  loguerHistorique_(idJoueurCible, p.idMatch, match.Journee, valeurTentee, valeurPrecedente, saisiParAdmin ? 'accepte_admin' : 'accepte', heureLimite);
  return { ok: true };
}

// --- Pronos spéciaux (finalistes + buteur) ---
function premierCoupEnvoi_() {
  const config = lireLignes_('Config');
  const ligne = config.find(c => c.Cle === 'PREMIER_COUP_ENVOI');
  return ligne ? new Date(ligne.Valeur) : null;
}

function valeurConfig_(cle) {
  const config = lireLignes_('Config');
  const ligne = config.find(c => c.Cle === cle);
  return ligne ? ligne.Valeur : '';
}

function ecrireConfig_(cle, valeur) {
  const config = lireLignes_('Config');
  const existant = config.find(c => c.Cle === cle);
  if (existant) {
    ecrireValeur_('Config', existant._ligne, 'Valeur', valeur);
  } else {
    feuille_('Config').appendRow([cle, valeur]);
  }
}

// --- Admin : enregistrer uniquement le buteur réel (le vainqueur et le
// finaliste se déduisent automatiquement du score de la finale une fois
// saisi dans Matchs, comme n'importe quel autre match) ---
function enregistrerButeurReel_(p) {
  const admin = verifierToken_(p.token);
  if (!estVrai_(admin.Admin)) return { erreur: 'Réservé aux admins.' };
  ecrireConfig_('BUTEUR_REEL', p.buteur);
  recalculerPointsSpeciaux();
  return { ok: true };
}

// --- Déduit vainqueur/finaliste dès que le score de la finale est
// rempli dans Matchs (Phase = 'finale'), sans ressaisie. A appeler après
// recalculerTousLesPoints() une fois les résultats à jour. ---
function verifierResultatFinale_() {
  const matchs = lireLignes_('Matchs');
  const finale = matchs.find(m => m.Phase === 'finale');
  if (!finale || finale.Score_Dom === '' || finale.Score_Dom === null) return;

  const vainqueur = Number(finale.Score_Dom) > Number(finale.Score_Ext) ? finale.Equipe_Domicile : finale.Equipe_Exterieur;
  const finaliste = vainqueur === finale.Equipe_Domicile ? finale.Equipe_Exterieur : finale.Equipe_Domicile;
  ecrireConfig_('VAINQUEUR_REEL', vainqueur);
  ecrireConfig_('FINALISTE_REEL', finaliste);
  recalculerPointsSpeciaux();
}

// --- Calcul des points des pronos spéciaux ---
// Base : la cote (marché "Finaliste") de chaque équipe correctement
// devinée, peu importe la place. Doublé si le vainqueur ET le finaliste
// sont tous les deux à la bonne place. Buteur : cote du buteur si trouvé.
function coteEquipe_(nom) {
  const equipes = lireLignes_('Equipes');
  const ligne = equipes.find(e => e.Nom === nom);
  return ligne ? Number(ligne.Cote) || 0 : 0;
}

function coteButeur_(nom) {
  const buteurs = lireLignes_('Buteurs');
  const ligne = buteurs.find(b => b.Nom === nom);
  return ligne ? Number(ligne.Cote) || 0 : 0;
}

function recalculerPointsSpeciaux() {
  const vainqueurReel = valeurConfig_('VAINQUEUR_REEL');
  const finalisteReel = valeurConfig_('FINALISTE_REEL');
  const buteurReel = valeurConfig_('BUTEUR_REEL');
  if (!vainqueurReel || !finalisteReel) return; // finale pas encore jouée

  const lignes = lireLignes_('PronosSpeciaux');
  lignes.forEach(l => {
    const equipesReelles = [vainqueurReel, finalisteReel];
    const equipesJoueur = [l.Finaliste_1, l.Finaliste_2];
    const trouvees = equipesJoueur.filter(e => equipesReelles.includes(e));

    let pointsPaire = trouvees.reduce((total, nom) => total + coteEquipe_(nom), 0);
    const bienPlace = l.Finaliste_1 === vainqueurReel && l.Finaliste_2 === finalisteReel;
    if (bienPlace) pointsPaire *= 2;

    const pointsButeur = (buteurReel && l.Buteur === buteurReel) ? coteButeur_(l.Buteur) : 0;

    ecrireValeur_('PronosSpeciaux', l._ligne, 'Points_Gagnes', pointsPaire + pointsButeur);
  });
}

function enregistrerSpeciaux_(p) {
  const verrou = LockService.getScriptLock();
  try {
    verrou.waitLock(10000);
  } catch (e) {
    return { erreur: 'Serveur occupé, réessaie dans un instant.' };
  }
  try {
    return enregistrerSpeciaux__(p);
  } finally {
    verrou.releaseLock();
  }
}

function enregistrerSpeciaux__(p) {
  const joueur = verifierToken_(p.token);
  const premier = premierCoupEnvoi_();
  if (premier && premier <= new Date()) {
    return { erreur: 'Les pronos spéciaux sont verrouillés.' };
  }

  const lignes = lireLignes_('PronosSpeciaux');
  const existant = lignes.find(l => String(l.ID_Joueur) === String(joueur.ID_Joueur));
  if (existant) {
    ecrireValeur_('PronosSpeciaux', existant._ligne, 'Finaliste_1', p.finaliste1);
    ecrireValeur_('PronosSpeciaux', existant._ligne, 'Finaliste_2', p.finaliste2);
    ecrireValeur_('PronosSpeciaux', existant._ligne, 'Buteur', p.buteur);
  } else {
    feuille_('PronosSpeciaux').appendRow([joueur.ID_Joueur, p.finaliste1, p.finaliste2, p.buteur, '']);
  }
  return { ok: true };
}

function speciauxJoueur_(p) {
  const joueur = verifierToken_(p.token);
  const premier = premierCoupEnvoi_();
  const verrouille = !!(premier && premier <= new Date());
  const lignes = lireLignes_('PronosSpeciaux');
  const existant = lignes.find(l => String(l.ID_Joueur) === String(joueur.ID_Joueur));
  return {
    verrouille,
    finaliste1: existant ? existant.Finaliste_1 : '',
    finaliste2: existant ? existant.Finaliste_2 : '',
    buteur: existant ? existant.Buteur : '',
  };
}

// --- Synchro automatique des horaires (football-data.org) ---
// A lancer via un déclencheur temporel Apps Script (Extensions > Apps
// Script > Déclencheurs > tous les jours), pas via l'appli. Compare
// l'heure stockée dans Matchs à celle renvoyée par l'API et met à jour
// Date_Heure si elle a changé. Le type de prono restant déterminé par
// la Phase (pas par la position du match), un changement d'horaire ne
// touche donc que le verrouillage, rien d'autre.
const FOOTBALL_DATA_API_KEY = 'ec83105aaef64fdda341a2848b70ef2e';
const FOOTBALL_DATA_COMPETITION = 'CL';

// Alignement des noms d'équipes entre le Sheet et l'API. A compléter
// au fur et à mesure si des correspondances ne matchent pas.
const NOMS_API_VERS_SHEET = {
  'Paris Saint-Germain FC': 'Paris SG',
  'FC Bayern München': 'Bayern Munich',
  'Arsenal FC': 'Arsenal',
  'FC Barcelona': 'FC Barcelone',
  'Manchester City FC': 'Manchester City',
  'Real Madrid CF': 'Real Madrid',
  'Liverpool FC': 'Liverpool',
  'Manchester United FC': 'Manchester United',
  'FC Internazionale Milano': 'Inter Milan',
  'Club Atlético de Madrid': 'Atlético Madrid',
  'AS Roma': 'AS Rome',
  'Aston Villa FC': 'Aston Villa',
  'Borussia Dortmund': 'Borussia Dortmund',
  'SSC Napoli': 'Naples',
  'RB Leipzig': 'RB Leipzig',
  'Real Betis Balompié': 'Real Betis Séville',
  'Villarreal CF': 'Villarreal',
  'VfB Stuttgart': 'VfB Stuttgart',
  'Como 1907': 'Côme',
  'FC Porto': 'FC Porto',
  'Sporting Clube de Portugal': 'Sporting CP',
  'FK Bodø/Glimt': 'Bodø/Glimt',
  'Racing Club de Lens': 'Lens',
  'PSV': 'PSV Eindhoven',
  'Fenerbahçe SK': 'Fenerbahçe',
  'Feyenoord Rotterdam': 'Feyenoord',
  'Galatasaray SK': 'Galatasaray',
  'LOSC Lille': 'Lille',
  'Club Brugge KV': 'Club Bruges',
  'AEK Athens FC': 'AEK Athens',
  'FC Shakhtar Donetsk': 'Shakhtar Donetsk',
  'SK Slavia Praha': 'Slavia Prague',
  'Viking FK': 'Viking FK',
  'ŠK Slovan Bratislava': 'Slovan Bratislava',
  'LASK': 'LASK',
  'FK Sabah': 'Sabah',
};

// --- Import automatique du calendrier complet (à lancer une fois,
// dès que le calendrier UEFA est publié — ne duplique pas si relancé) ---
function importerCalendrier() {
  const options = {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
    muteHttpExceptions: true,
  };
  const url = `https://api.football-data.org/v4/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=2026`;
  const reponse = UrlFetchApp.fetch(url, options);
  Logger.log('Code HTTP : ' + reponse.getResponseCode());
  Logger.log('Réponse brute : ' + reponse.getContentText().slice(0, 800));
  const donnees = JSON.parse(reponse.getContentText());
  if (!donnees.matches) {
    Logger.log('Réponse API sans "matches" : ' + reponse.getContentText().slice(0, 500));
    return { erreur: 'Réponse API invalide : ' + reponse.getContentText().slice(0, 200) };
  }

  const feuille = feuille_('Matchs');
  const existants = lireLignes_('Matchs');

  const stageVersPhase = {
    LEAGUE_STAGE: 'ligue',
    KNOCKOUT_ROUND_PLAY_OFFS: 'barrages',
    LAST_16: '8e',
    QUARTER_FINALS: '4e',
    SEMI_FINALS: '1-2',
    FINAL: 'finale',
  };

  let ajoutes = 0;
  let ignores = 0;
  donnees.matches.forEach(m => {
    const phase = stageVersPhase[m.stage];
    if (!phase) return; // tours de qualification, pas concernés par le challenge

    const domicile = NOMS_API_VERS_SHEET[m.homeTeam.name] || m.homeTeam.name;
    const exterieur = NOMS_API_VERS_SHEET[m.awayTeam.name] || m.awayTeam.name;

    const dejaLa = existants.some(e => e.Equipe_Domicile === domicile && e.Equipe_Exterieur === exterieur);
    if (dejaLa) { ignores++; return; }

    const journee = phase === 'ligue' ? m.matchday : '';
    const typeProno = phase === 'ligue' ? '1N2' : 'ScoreExact';

    feuille.appendRow([m.id, phase, journee, domicile, exterieur, new Date(m.utcDate), '', '', '', typeProno, '', '', 'a_venir']);
    ajoutes++;
  });

  const resultat = { ok: true, matchsAjoutes: ajoutes, matchsDejaPresents: ignores, totalRecu: donnees.matches.length };
  Logger.log(JSON.stringify(resultat));
  return resultat;
}

function synchroniserHoraires() {
  const options = {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
    muteHttpExceptions: true,
  };
  const url = `https://api.football-data.org/v4/competitions/${FOOTBALL_DATA_COMPETITION}/matches?season=2026`;
  const reponse = UrlFetchApp.fetch(url, options);
  const donnees = JSON.parse(reponse.getContentText());
  if (!donnees.matches) return { erreur: 'Réponse API invalide.' };

  const matchsSheet = lireLignes_('Matchs');
  let miseAJour = 0;

  donnees.matches.forEach(mApi => {
    const domicileApi = NOMS_API_VERS_SHEET[mApi.homeTeam.name] || mApi.homeTeam.name;
    const exterieurApi = NOMS_API_VERS_SHEET[mApi.awayTeam.name] || mApi.awayTeam.name;

    const match = matchsSheet.find(m =>
      m.Equipe_Domicile === domicileApi && m.Equipe_Exterieur === exterieurApi
    );
    if (!match) return; // pas encore saisi côté Sheet, ou nom non aligné

    const nouvelleHeure = new Date(mApi.utcDate);
    const heureActuelle = new Date(match.Date_Heure);
    if (nouvelleHeure.getTime() !== heureActuelle.getTime()) {
      ecrireValeur_('Matchs', match._ligne, 'Date_Heure', nouvelleHeure);
      miseAJour++;
    }
  });

  // Fixes du 29/08 (répliqués depuis Challenge L1, cf. RECAP-FIXES-LIVE) :
  // scores en direct via SofaScore en complément, et gel du classement de
  // référence au bon moment pour les flèches ▲▼.
  const resultatScoresLive = synchroniserScoresEnDirect();
  verifierEtFigerClassement_();

  return { ok: true, matchsMisAJour: miseAJour, scoresLive: resultatScoresLive };
}

// ============================================================
// Scores en direct — SofaScore en complément de football-data.org
// ============================================================
// football-data.org (plan gratuit) retarde le passage à IN_PLAY/FINISHED
// de plusieurs heures. SofaScore (API non-officielle, gratuite) est
// ajoutée UNIQUEMENT pour le statut/score en direct — jamais bloquant :
// si SofaScore échoue, on garde simplement ce qu'on avait avant (jamais
// pire qu'avant ce fix). football-data.org reste la seule source du
// calendrier/horaires, inchangé au-dessus.
const SOFASCORE_TOURNAMENT_ID = 7; // UEFA Champions League

// Alignement des noms d'équipes SofaScore -> noms du Sheet (Equipes).
// Vérifié sur les 36 équipes de la saison 26/27 (classement SofaScore).
const NOMS_SOFASCORE_VERS_SHEET = {
  'AEK Athens': 'AEK Athens',
  'AS Roma': 'AS Rome',
  'Arsenal': 'Arsenal',
  'Aston Villa': 'Aston Villa',
  'Atlético Madrid': 'Atlético Madrid',
  'Bodø/Glimt': 'Bodø/Glimt',
  'Borussia Dortmund': 'Borussia Dortmund',
  'Club Brugge KV': 'Club Bruges',
  'Como': 'Côme',
  'FC Barcelona': 'FC Barcelone',
  'FC Bayern München': 'Bayern Munich',
  'FC Porto': 'FC Porto',
  'Fenerbahçe': 'Fenerbahçe',
  'Feyenoord': 'Feyenoord',
  'Galatasaray': 'Galatasaray',
  'Inter': 'Inter Milan',
  'LASK': 'LASK',
  'Lille': 'Lille',
  'Liverpool FC': 'Liverpool',
  'Manchester City': 'Manchester City',
  'Manchester United': 'Manchester United',
  'PSV Eindhoven': 'PSV Eindhoven',
  'Paris Saint-Germain': 'Paris SG',
  'RB Leipzig': 'RB Leipzig',
  'RC Lens': 'Lens',
  'Real Betis': 'Real Betis Séville',
  'Real Madrid': 'Real Madrid',
  'SK Slavia Praha': 'Slavia Prague',
  'SSC Napoli': 'Naples',
  'Sabah FK': 'Sabah',
  'Shakhtar Donetsk': 'Shakhtar Donetsk',
  'Sporting CP': 'Sporting CP',
  'VfB Stuttgart': 'VfB Stuttgart',
  'Viking FK': 'Viking FK',
  'Villarreal': 'Villarreal',
  'ŠK Slovan Bratislava': 'Slovan Bratislava',
};

// Résout et met en cache l'ID de la saison SofaScore correspondant à la
// saison en cours (26/27), pour ne pas refaire cet appel à chaque fois.
function obtenirSaisonSofascore_() {
  const cache = PropertiesService.getScriptProperties();
  const cachedId = cache.getProperty('SOFASCORE_SEASON_ID');
  if (cachedId) return cachedId;

  const url = `https://api.sofascore.com/api/v1/unique-tournament/${SOFASCORE_TOURNAMENT_ID}/seasons`;
  const reponse = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const donnees = JSON.parse(reponse.getContentText());
  const saison = (donnees.seasons || []).find(s => String(s.year) === '26/27') || (donnees.seasons || [])[0];
  if (!saison) throw new Error('Saison SofaScore introuvable.');

  cache.setProperty('SOFASCORE_SEASON_ID', String(saison.id));
  return String(saison.id);
}

// Récupère les matchs d'une journée (round) côté SofaScore. Ne lève
// JAMAIS d'exception — retourne null si indisponible, pour que l'appelant
// retombe simplement sur les données football-data.org existantes.
// NB : ce endpoint "round" est fait pour la phase de ligue (8 journées,
// comme L1). Pour barrages/8e/4e/1-2/finale, la structure SofaScore est
// probablement différente (pas de "round" classique) — à tester une fois
// ces phases atteintes ; en attendant, le repli automatique s'applique.
function recupererMatchsSofascoreJournee_(numeroJournee) {
  try {
    const seasonId = obtenirSaisonSofascore_();
    const url = `https://api.sofascore.com/api/v1/unique-tournament/${SOFASCORE_TOURNAMENT_ID}/season/${seasonId}/events/round/${numeroJournee}`;
    const reponse = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (reponse.getResponseCode() !== 200) return null;
    const donnees = JSON.parse(reponse.getContentText());
    return donnees.events || null;
  } catch (err) {
    return null;
  }
}

// Statuts SofaScore utiles : 'notstarted', 'inprogress', 'finished'
// (parfois 'postponed', 'canceled' — ignorés, on garde l'existant).
function statutSofascoreExploitable_(statutType) {
  return statutType === 'inprogress' || statutType === 'finished';
}

// Synchronise le statut/score en direct pour toutes les journées de
// phase de ligue ayant au moins un match déjà commencé et pas encore
// marqué "termine". Jamais bloquant : toute erreur SofaScore laisse les
// données existantes intactes.
function synchroniserScoresEnDirect() {
  const matchs = lireLignes_('Matchs');
  const maintenant = new Date();

  const journeesACeckecker = new Set();
  matchs.forEach(m => {
    if (m.Phase !== 'ligue' || m.Journee === '') return;
    if (m.Statut === 'termine') return;
    if (new Date(m.Date_Heure) > maintenant) return; // pas encore commencé
    journeesACeckecker.add(Number(m.Journee));
  });

  let matchsMisAJour = 0;
  journeesACeckecker.forEach(journee => {
    const events = recupererMatchsSofascoreJournee_(journee);
    if (!events) return; // SofaScore indisponible, on garde l'existant

    events.forEach(ev => {
      if (!statutSofascoreExploitable_(ev.status && ev.status.type)) return;

      const domicileSofa = NOMS_SOFASCORE_VERS_SHEET[ev.homeTeam.name] || ev.homeTeam.name;
      const exterieurSofa = NOMS_SOFASCORE_VERS_SHEET[ev.awayTeam.name] || ev.awayTeam.name;
      const match = matchs.find(m =>
        Number(m.Journee) === journee && m.Equipe_Domicile === domicileSofa && m.Equipe_Exterieur === exterieurSofa
      );
      if (!match) return; // nom non mappé ou match introuvable, on ignore ce match

      const scoreDom = ev.homeScore && ev.homeScore.current;
      const scoreExt = ev.awayScore && ev.awayScore.current;
      if (scoreDom === undefined || scoreExt === undefined) return;

      const nouveauStatut = ev.status.type === 'finished' ? 'termine' : 'en_cours';
      ecrireValeur_('Matchs', match._ligne, 'Score_Dom', scoreDom);
      ecrireValeur_('Matchs', match._ligne, 'Score_Ext', scoreExt);
      ecrireValeur_('Matchs', match._ligne, 'Statut', nouveauStatut);
      matchsMisAJour++;
    });
  });

  return { matchsMisAJour, journeesVerifiees: journeesACeckecker.size };
}

// ============================================================
// Récupération automatique des cotes 1N2 (SofaScore) — outil admin
// ============================================================
// Fidèle à Cotes.gs de Challenge L1. SofaScore expose des cotes par
// match (marché "Full time" / "1X2"), au format fractionnaire anglais
// (ex: "9/4"), à convertir en décimal pour matcher le format déjà
// utilisé dans le Sheet ("2,25"). Contrairement au direct
// (synchroniserScoresEnDirect), ceci n'est PAS automatique : c'est un
// outil admin à lancer à la main, quelques jours avant chaque journée,
// donc pas de risque de rate-limit même avec une petite pause entre
// chaque appel.

function convertirCoteFractionnaire_(fractionStr) {
  const parts = String(fractionStr).split('/');
  if (parts.length !== 2) return null;
  const num = Number(parts[0]);
  const den = Number(parts[1]);
  if (!den || isNaN(num)) return null;
  return Math.round((num / den + 1) * 100) / 100;
}

// Récupère l'id SofaScore + les noms d'équipes (mappés vers les noms du
// Sheet) pour chaque match d'une journée. Renvoie null si l'appel échoue.
function fetchIdsMatchsSofaScore_(journee) {
  const events = recupererMatchsSofascoreJournee_(journee);
  if (!events) return null;
  return events.map(e => ({
    id: e.id,
    domicile: NOMS_SOFASCORE_VERS_SHEET[e.homeTeam.name] || e.homeTeam.name,
    exterieur: NOMS_SOFASCORE_VERS_SHEET[e.awayTeam.name] || e.awayTeam.name,
  }));
}

// Récupère les cotes 1/N/2 d'un match précis (marché "Full time").
// Renvoie null si le marché n'existe pas ou si l'appel échoue.
function fetchCotesMatchSofaScore_(idSofaScore) {
  const url = `https://api.sofascore.com/api/v1/event/${idSofaScore}/odds/1/all`;
  let reponse;
  try {
    reponse = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    return null;
  }
  if (reponse.getResponseCode() !== 200) return null;

  let data;
  try {
    data = JSON.parse(reponse.getContentText());
  } catch (e) {
    return null;
  }
  const marches = data.markets || [];
  const marche1x2 = marches.find(m => m.marketName === 'Full time' && m.marketGroup === '1X2');
  if (!marche1x2) return null;

  const cotes = {};
  marche1x2.choices.forEach(c => {
    const decimal = convertirCoteFractionnaire_(c.fractionalValue);
    if (c.name === '1') cotes.cote1 = decimal;
    if (c.name === 'X') cotes.coteN = decimal;
    if (c.name === '2') cotes.cote2 = decimal;
  });
  if (cotes.cote1 == null || cotes.coteN == null || cotes.cote2 == null) return null;
  return cotes;
}

// Fonction principale (appelée depuis l'écran Admin) : récupère les
// cotes 1/N/2 de tous les matchs d'une journée et les écrit dans le
// Sheet. Ne touche jamais aux matchs sans correspondance trouvée côté
// SofaScore — ceux-là restent à saisir à la main, listés dans "echecs"
// pour que l'admin sache lesquels vérifier.
function recupererCotesJournee_(p) {
  const admin = verifierToken_(p.token);
  if (!estVrai_(admin.Admin)) return { erreur: 'Réservé aux admins.' };

  const journee = Number(p.journee);
  const idsMatchs = fetchIdsMatchsSofaScore_(journee);
  if (!idsMatchs) return { erreur: 'SofaScore indisponible pour cette journée.' };

  const matchs = lireLignes_('Matchs').filter(m => Number(m.Journee) === journee);
  if (!matchs.length) return { erreur: 'Journée introuvable dans le Sheet.' };

  let corriges = 0;
  const echecs = [];

  idsMatchs.forEach((im, index) => {
    const match = matchs.find(m => m.Equipe_Domicile === im.domicile && m.Equipe_Exterieur === im.exterieur);
    if (!match) {
      echecs.push(`${im.domicile} vs ${im.exterieur} (aucune ligne correspondante)`);
      return;
    }

    const cotes = fetchCotesMatchSofaScore_(im.id);
    if (!cotes) {
      echecs.push(`${im.domicile} vs ${im.exterieur} (cotes indisponibles)`);
      return;
    }

    ecrireValeur_('Matchs', match._ligne, 'Cote_1', cotes.cote1);
    ecrireValeur_('Matchs', match._ligne, 'Cote_N', cotes.coteN);
    ecrireValeur_('Matchs', match._ligne, 'Cote_2', cotes.cote2);
    corriges++;

    // Espace les appels : pas un cron, une fois par journée à la main,
    // donc large marge de sécurité face à un éventuel blocage.
    if (index < idsMatchs.length - 1) Utilities.sleep(1500);
  });

  return { ok: true, corriges, echecs };
}

// ============================================================
// Classement — fidèle à Classement.gs de Challenge L1
// ============================================================
// Le rang de référence (pour les flèches ▲▼) est stocké directement sur
// la feuille "Joueurs" (colonnes Rang_Actuel, Rang_Precedent), pas dans
// une feuille séparée. Seul le classement GÉNÉRAL a des flèches — le HR
// n'en a pas chez L1, juste points + rang. Chaque classement est mis en
// cache 10 minutes (CacheService) pour éviter de tout recalculer à
// chaque chargement de page.
const CACHE_DUREE_SECONDES = 600;

function calculerTotaux_(joueursListe, pronosListe, speciauxListe, champPaye) {
  const totaux = {};
  pronosListe.forEach(p => {
    totaux[p.ID_Joueur] = (totaux[p.ID_Joueur] || 0) + (Number(p.Points_Gagnes) || 0);
  });
  speciauxListe.forEach(s => {
    totaux[s.ID_Joueur] = (totaux[s.ID_Joueur] || 0) + (Number(s.Points_Gagnes) || 0);
  });

  return joueursListe
    .map(j => ({
      idJoueur: j.ID_Joueur,
      nom: `${j.Prenom} ${j.Nom}`,
      points: totaux[j.ID_Joueur] || 0,
      paye: estVrai_(j[champPaye]),
    }))
    // Ex-aequo départagés par ID_Joueur croissant (stable, pas d'offset à gérer)
    .sort((a, b) => (b.points - a.points) || (a.idJoueur - b.idJoueur))
    .map((c, i) => ({ ...c, rang: i + 1 }));
}

// --- Classement général (avec flèches ▲▼) ---
function recalculerClassementGeneral_() {
  const joueurs = lireLignes_('Joueurs');
  const pronos = lireLignes_('Pronos');
  const speciaux = lireLignes_('PronosSpeciaux');
  let classement = calculerTotaux_(joueurs, pronos, speciaux, 'Paye');

  const rangReference = {};
  joueurs.forEach(j => { rangReference[j.ID_Joueur] = j.Rang_Precedent || null; });
  classement = classement.map(c => ({
    ...c,
    delta: rangReference[c.idJoueur] ? Number(rangReference[c.idJoueur]) - c.rang : null,
  }));

  // On écrit uniquement le rang actuel ; le rang de référence reste intact
  // jusqu'au prochain figeage (voir verifierEtFigerClassement_).
  const feuilleJoueurs = feuille_('Joueurs');
  joueurs.forEach(j => {
    const c = classement.find(x => x.idJoueur === j.ID_Joueur);
    ecrireValeur_('Joueurs', j._ligne, 'Rang_Actuel', c ? c.rang : '');
  });

  CacheService.getScriptCache().put('classement_general', JSON.stringify(classement), CACHE_DUREE_SECONDES);
  return classement;
}

// --- Classement HR (sous-groupe de joueurs, pas de flèches) ---
function recalculerClassementHR_() {
  const joueurs = lireLignes_('Joueurs').filter(j => estVrai_(j.ParticipeHR));
  const pronos = lireLignes_('Pronos');
  const speciaux = lireLignes_('PronosSpeciaux');
  let classement = calculerTotaux_(joueurs, pronos, speciaux, 'PayeHR');

  const rangReference = {};
  joueurs.forEach(j => { rangReference[j.ID_Joueur] = j.Rang_Precedent_HR || null; });
  classement = classement.map(c => ({
    ...c,
    delta: rangReference[c.idJoueur] ? Number(rangReference[c.idJoueur]) - c.rang : null,
  }));

  joueurs.forEach(j => {
    const c = classement.find(x => x.idJoueur === j.ID_Joueur);
    ecrireValeur_('Joueurs', j._ligne, 'Rang_Actuel_HR', c ? c.rang : '');
  });

  CacheService.getScriptCache().put('classement_hr', JSON.stringify(classement), CACHE_DUREE_SECONDES);
  return classement;
}

function classement_() {
  const cache = CacheService.getScriptCache().get('classement_general');
  return cache ? JSON.parse(cache) : recalculerClassementGeneral_();
}

function classementHR_() {
  const cache = CacheService.getScriptCache().get('classement_hr');
  return cache ? JSON.parse(cache) : recalculerClassementHR_();
}

function recalculerTousLesClassements_() {
  recalculerClassementGeneral_();
  recalculerClassementHR_();
}

// A appeler uniquement quand une journée vient de commencer : copie le
// rang actuel dans le rang de référence (général ET HR), pour que les
// flèches repartent à zéro depuis ce point (et restent stables pendant
// toute la trêve).
function figerRangsReference_() {
  const joueurs = lireLignes_('Joueurs');
  joueurs.forEach(j => {
    ecrireValeur_('Joueurs', j._ligne, 'Rang_Precedent', j.Rang_Actuel || '');
    if (estVrai_(j.ParticipeHR)) {
      ecrireValeur_('Joueurs', j._ligne, 'Rang_Precedent_HR', j.Rang_Actuel_HR || '');
    }
  });
}

// --- Fix flèches de classement (▲▼) — gel au bon moment ---
// Le rang de référence ne doit se figer qu'au coup d'envoi du premier
// match de la journée SUIVANTE (pas à la fin de la journée en cours),
// pour que les flèches restent visibles pendant toute la trêve. Verrou
// par journée via PropertiesService pour ne pas re-figer à chaque
// passage du cron.
function verifierEtFigerClassement_() {
  const props = PropertiesService.getScriptProperties();
  const matchs = lireLignes_('Matchs').filter(m => m.Phase === 'ligue' && m.Journee !== '');
  if (!matchs.length) return;

  const debutParJournee = {};
  matchs.forEach(m => {
    const j = Number(m.Journee);
    const d = new Date(m.Date_Heure);
    if (!debutParJournee[j] || d < debutParJournee[j]) debutParJournee[j] = d;
  });

  const maintenant = new Date();
  Object.keys(debutParJournee).forEach(j => {
    if (debutParJournee[j] > maintenant) return; // journée pas encore commencée
    const cle = 'CLASSEMENT_FIGE_J' + j;
    if (props.getProperty(cle)) return; // déjà fait pour cette journée
    recalculerClassementGeneral_(); // s'assure que Rang_Actuel est à jour avant de le figer
    recalculerClassementHR_(); // idem pour Rang_Actuel_HR
    figerRangsReference_();
    props.setProperty(cle, 'fait');
  });
}

// --- Voir les pronos des autres (uniquement sur un match verrouillé) ---
function pronosDesAutres_(p) {
  verifierToken_(p.token);
  const matchs = lireLignes_('Matchs');
  const match = matchs.find(m => String(m.ID_Match) === String(p.idMatch));
  if (!match) throw new Error('Match introuvable.');
  if (new Date(match.Date_Heure) > new Date()) {
    return { erreur: 'Ce match n\'est pas encore verrouillé.' };
  }

  const joueurs = lireLignes_('Joueurs');
  const pronos = lireLignes_('Pronos').filter(pr => String(pr.ID_Match) === String(p.idMatch));

  return pronos.map(pr => {
    const joueur = joueurs.find(j => String(j.ID_Joueur) === String(pr.ID_Joueur));
    return {
      nom: joueur ? `${joueur.Prenom} ${joueur.Nom}` : '?',
      prono1n2: pr.Prono_1N2 || null,
      scoreDom: pr.Prono_Score_Dom === '' ? null : pr.Prono_Score_Dom,
      scoreExt: pr.Prono_Score_Ext === '' ? null : pr.Prono_Score_Ext,
    };
  });
}

// --- Side bets (défis 1v1 entre joueurs) ---
// Feuille "SideBets" : ID_Joueur1, ID_Joueur2, Mise, Commentaire — gérée
// à la main par l'admin. Les points de chacun viennent du classement
// général déjà calculé (mis en cache).
function sideBets_() {
  const bets = lireLignes_('SideBets');
  const classementComplet = classement_();
  const parId = {};
  classementComplet.forEach(c => { parId[c.idJoueur] = c; });

  return bets
    .filter(sb => sb.ID_Joueur1 && sb.ID_Joueur2)
    .map(sb => {
      const j1 = parId[sb.ID_Joueur1];
      const j2 = parId[sb.ID_Joueur2];
      if (!j1 || !j2) return null;
      return {
        joueur1: { nom: j1.nom.split(' ').slice(1).join(' '), prenom: j1.nom.split(' ')[0], points: j1.points },
        joueur2: { nom: j2.nom.split(' ').slice(1).join(' '), prenom: j2.nom.split(' ')[0], points: j2.points },
        mise: sb.Mise || '',
        commentaire: sb.Commentaire || '',
      };
    })
    .filter(x => x !== null);
}

// A LANCER UNE SEULE FOIS, À LA MAIN, après avoir déployé ce nouveau
// système d'authentification par hash : crée le hash/sel pour tous les
// joueurs déjà présents dans le Sheet (dont la colonne MotDePasse était
// jusqu'ici la seule vérité), à partir de leur mot de passe en clair
// actuel. Sans ça, leur connexion casserait (plus rien à comparer).
// Idempotent : ignore les joueurs qui ont déjà un hash.
function migrerMotsDePasseExistants() {
  const joueurs = lireLignes_('Joueurs');
  const props = PropertiesService.getScriptProperties();
  let migres = 0;

  joueurs.forEach(j => {
    if (props.getProperty('hash_' + j.ID_Joueur)) return; // déjà migré
    if (!j.MotDePasse) return; // rien à migrer

    const sel = genererSel_();
    const hash = hashMotDePasse_(String(j.MotDePasse), sel);
    props.setProperty('sel_' + j.ID_Joueur, sel);
    props.setProperty('hash_' + j.ID_Joueur, hash);
    migres++;
  });

  Logger.log(`${migres} mot(s) de passe migré(s).`);
  return { ok: true, migres };
}

function ajouterJoueur_(p) {
  const admin = verifierToken_(p.token);
  if (!estVrai_(admin.Admin)) return { erreur: 'Réservé aux admins.' };
  const joueurs = lireLignes_('Joueurs');
  const prochainId = joueurs.reduce((max, j) => Math.max(max, Number(j.ID_Joueur) || 0), 0) + 1;

  ajouterLigneParNoms_('Joueurs', {
    ID_Joueur: prochainId,
    Nom: p.nom,
    Prenom: p.prenom,
    MotDePasse: p.motDePasse || '', // gardé en clair pour référence admin, comme sur L1 — jamais utilisé pour l'authentification
    Admin: !!p.admin,
  });

  if (p.motDePasse) {
    const sel = genererSel_();
    const hash = hashMotDePasse_(p.motDePasse, sel);
    const props = PropertiesService.getScriptProperties();
    props.setProperty('sel_' + prochainId, sel);
    props.setProperty('hash_' + prochainId, hash);
  }

  return { ok: true, idJoueur: prochainId };
}

// Retire un joueur (ligne + hash/sel associés). A utiliser avant le
// début de saison seulement : ne nettoie pas ses pronos/historique s'il
// en a déjà, juste sa ligne Joueurs et ses identifiants.
function supprimerJoueur_(p) {
  const admin = verifierToken_(p.token);
  if (!estVrai_(admin.Admin)) return { erreur: 'Réservé aux admins.' };
  const joueurs = lireLignes_('Joueurs');
  const joueur = joueurs.find(j => String(j.ID_Joueur) === String(p.idJoueur));
  if (!joueur) return { erreur: 'Joueur introuvable.' };

  feuille_('Joueurs').deleteRow(joueur._ligne);
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('hash_' + p.idJoueur);
  props.deleteProperty('sel_' + p.idJoueur);
  return { ok: true };
}

// --- Calcul des points (à lancer après saisie des résultats) ---
// Barème : la cote du résultat trouvé (1/N/2), doublée si le score exact
// est également trouvé sur les matchs en Type_Prono = 'ScoreExact'.
function calculerPointsMatch_(match, prono) {
  if (match.Score_Dom === '' || match.Score_Dom === null) return 0; // pas encore joué

  const resultatReel = match.Score_Dom > match.Score_Ext ? '1' : (match.Score_Dom < match.Score_Ext ? '2' : 'N');
  const cotes = { '1': match.Cote_1, 'N': match.Cote_N, '2': match.Cote_2 };

  let pronoResultat, scoreExactTrouve = false;
  if (match.Type_Prono === 'ScoreExact') {
    if (prono.Prono_Score_Dom === '' || prono.Prono_Score_Dom === null) return 0;
    pronoResultat = prono.Prono_Score_Dom > prono.Prono_Score_Ext ? '1' : (prono.Prono_Score_Dom < prono.Prono_Score_Ext ? '2' : 'N');
    scoreExactTrouve = Number(prono.Prono_Score_Dom) === Number(match.Score_Dom) && Number(prono.Prono_Score_Ext) === Number(match.Score_Ext);
  } else {
    if (!prono.Prono_1N2) return 0;
    pronoResultat = texte_(prono.Prono_1N2);
  }

  if (pronoResultat !== resultatReel) return 0;
  const points = Number(cotes[resultatReel]) || 0;
  return scoreExactTrouve ? points * 2 : points;
}

function recalculerTousLesPoints() {
  const matchs = lireLignes_('Matchs');
  const pronos = lireLignes_('Pronos');
  pronos.forEach(prono => {
    const match = matchs.find(m => String(m.ID_Match) === String(prono.ID_Match));
    if (!match) return;
    const points = calculerPointsMatch_(match, prono);
    ecrireValeur_('Pronos', prono._ligne, 'Points_Gagnes', points);
  });
  verifierResultatFinale_();
  recalculerTousLesClassements_();
}
