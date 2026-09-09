// ============================================================
// script.js — Challenge Ligue des Champions
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbx5SH2kyO-KpobZV8KdgZ2EKnvZWMHeixJT5GiBLet2TNpaVPsjKQdxBh5H7cfpLVW4uw/exec';
const TOTAL_JOURNEES = 8;

let journeeCourante = 1;
let joueurCourant = null;
let idJoueurAffiche = null;
let listeJoueursGlobale = [];
let modeProno = 'matchs';

// --- Stockage du token ---
const getToken = () => localStorage.getItem('token_challenge_ldc');
const setToken = t => localStorage.setItem('token_challenge_ldc', t);
const clearToken = () => localStorage.removeItem('token_challenge_ldc');

// --- Appels API ---
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined) url.searchParams.set(k, v); });
  const res = await fetch(url);
  return res.json();
}

async function apiPost(action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, token: getToken(), ...body }),
  });
  return res.json();
}

// --- Demarrage ---
document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('btn-connexion').addEventListener('click', connexion);
  document.querySelectorAll('.onglet').forEach(b => b.addEventListener('click', () => changerOnglet(b.dataset.vue)));
  document.getElementById('btn-deconnexion').addEventListener('click', () => { clearToken(); location.reload(); });
  document.getElementById('select-journee').addEventListener('change', e => chargerJournee(Number(e.target.value)));
  document.getElementById('btn-journee-precedente').addEventListener('click', () => chargerJournee(journeeCourante - 1));
  document.getElementById('btn-journee-suivante').addEventListener('click', () => chargerJournee(journeeCourante + 1));
  document.getElementById('btn-sauvegarder-speciaux').addEventListener('click', sauvegarderSpeciaux);

  document.querySelectorAll('.sous-onglet-pronos').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sous-onglet-pronos').forEach(x => x.classList.remove('actif'));
    b.classList.add('actif');
    modeProno = b.dataset.modePronos;
    document.getElementById('carte-pronos').style.display = modeProno === 'speciaux' ? 'none' : 'block';
    document.getElementById('carte-speciaux').style.display = modeProno === 'speciaux' ? 'block' : 'none';
    if (modeProno === 'speciaux') chargerSpeciaux();
    else chargerJournee(journeeCourante);
  }));

  document.querySelectorAll('.sous-onglet-classement').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sous-onglet-classement').forEach(x => x.classList.remove('actif'));
    b.classList.add('actif');
    const mode = b.dataset.modeClassement;
    document.getElementById('carte-classement-table').style.display = mode === 'general' ? 'block' : 'none';
    document.getElementById('carte-classement-hr').style.display = mode === 'hr' ? 'block' : 'none';
    if (mode === 'general') chargerClassement();
    else if (mode === 'hr') chargerClassementHR();
  }));

  // Quoi qu'il arrive côté API (déploiement mal réglé, réseau, etc.),
  // on affiche toujours un écran plutôt que de laisser la page vide.
  try {
    const token = getToken();
    const reponse = await apiGet('demarrage', { token, journee: 1 });

    listeJoueursGlobale = Array.isArray(reponse.joueurs) ? reponse.joueurs : [];
    const select = document.getElementById('select-joueur');
    select.innerHTML = '<option value="">Choisis ton nom</option>';
    listeJoueursGlobale.forEach(j => {
      const opt = document.createElement('option');
      opt.value = j.id;
      opt.textContent = j.nomAffiche;
      select.appendChild(opt);
    });

    if (reponse.moi) {
      matchsPreCharges_ = Array.isArray(reponse.matchs) ? reponse.matchs : null;
      afficherApp(reponse.moi);
      return;
    }
    if (token) clearToken();
  } catch (err) {
    console.error('Erreur au chargement :', err);
    document.getElementById('erreur-connexion').textContent = 'Connexion au serveur impossible. Réessaie dans un instant.';
  }
  document.getElementById('vue-connexion').style.display = 'flex';
}

let matchsPreCharges_ = null;

async function connexion() {
  const idJoueur = document.getElementById('select-joueur').value;
  const motDePasse = document.getElementById('input-mdp').value;
  const erreur = document.getElementById('erreur-connexion');
  erreur.textContent = '';

  if (!idJoueur || !motDePasse) {
    erreur.textContent = 'Choisis ton nom et entre un mot de passe.';
    return;
  }

  const reponse = await apiPost('connexion', { idJoueur, motDePasse });
  if (reponse.erreur) {
    erreur.textContent = reponse.erreur;
    return;
  }
  setToken(reponse.token);
  const infos = await apiGet('moi', { token: reponse.token });
  afficherApp(infos);
}

function afficherApp(joueur) {
  joueurCourant = joueur;
  document.getElementById('vue-connexion').style.display = 'none';
  document.getElementById('vue-app').style.display = 'block';

  if (joueur.admin) {
    document.getElementById('onglet-admin').style.display = 'inline-block';
    const bloc = document.getElementById('bloc-admin-cible');
    bloc.style.display = 'block';
    const select = document.getElementById('select-cible-admin');
    select.innerHTML = '<option value="">Moi-même</option>';
    listeJoueursGlobale.forEach(j => {
      if (String(j.id) === String(joueur.idJoueur)) return;
      const opt = document.createElement('option');
      opt.value = j.id;
      opt.textContent = j.nomAffiche;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      idJoueurAffiche = select.value || null;
      chargerJournee(journeeCourante);
    });
  }

  peuplerSelectJournee_();
  chargerJournee(journeeCourante);
}

function changerOnglet(vue) {
  document.querySelectorAll('.onglet').forEach(b => b.classList.toggle('actif', b.dataset.vue === vue));
  document.getElementById('ecran-pronos').style.display = vue === 'pronos' ? 'block' : 'none';
  document.getElementById('ecran-classement').style.display = vue === 'classement' ? 'block' : 'none';
  document.getElementById('ecran-reglement').style.display = vue === 'reglement' ? 'block' : 'none';
  document.getElementById('ecran-admin').style.display = vue === 'admin' ? 'block' : 'none';
  if (vue === 'classement') chargerClassement();
}

// --- Ecran Pronos : matchs ---

function peuplerSelectJournee_() {
  const select = document.getElementById('select-journee');
  select.innerHTML = '';
  for (let n = 1; n <= TOTAL_JOURNEES; n++) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = `Journée ${n}`;
    select.appendChild(opt);
  }
  select.value = journeeCourante;
}

function majFlechesNavigation_() {
  document.getElementById('btn-journee-precedente').disabled = journeeCourante <= 1;
  document.getElementById('btn-journee-suivante').disabled = journeeCourante >= TOTAL_JOURNEES;
}

async function chargerJournee(n) {
  if (n < 1 || n > TOTAL_JOURNEES) return;
  journeeCourante = n;
  document.getElementById('select-journee').value = n;
  majFlechesNavigation_();

  const conteneur = document.getElementById('liste-matchs');

  let matchs;
  if (n === 1 && matchsPreCharges_) {
    matchs = matchsPreCharges_;
    matchsPreCharges_ = null; // ne sert qu'une fois, au tout premier chargement
  } else {
    conteneur.innerHTML = '<p class="note">Chargement...</p>';
    matchs = await apiGet('matchsJournee', { journee: n, token: getToken(), idJoueurCible: idJoueurAffiche });
  }

  conteneur.innerHTML = '';
  if (!Array.isArray(matchs)) return;

  matchs.forEach(m => conteneur.appendChild(construireLigneMatch(m)));
  majCompteur(matchs);
}

function majCompteur(matchs) {
  const pronostiques = matchs.filter(m => m.pronostique).length;
  document.getElementById('compteur-pronos').textContent = `${pronostiques} / ${matchs.length} pronostiqué${matchs.length > 1 ? 's' : ''}`;
}

function construireBoutonAutresPronos_(idMatch) {
  const conteneur = document.createElement('div');
  conteneur.className = 'autres-pronos';

  const btn = document.createElement('button');
  btn.className = 'btn-autres-pronos';
  btn.textContent = 'Voir les pronos des autres ▾';

  const liste = document.createElement('div');
  liste.className = 'liste-autres-pronos';
  liste.style.display = 'none';

  let charge = false;
  btn.addEventListener('click', async () => {
    const ouvert = liste.style.display !== 'none';
    if (ouvert) {
      liste.style.display = 'none';
      btn.textContent = 'Voir les pronos des autres ▾';
      return;
    }
    btn.textContent = 'Masquer les pronos des autres ▴';
    liste.style.display = 'block';
    if (charge) return;
    charge = true;

    liste.innerHTML = '<p class="note">Chargement...</p>';
    const reponse = await apiGet('pronosDesAutres', { token: getToken(), idMatch });
    if (!reponse || !reponse.verrouille || !reponse.groupes.length) {
      liste.innerHTML = '<p class="note">Personne n\'a encore pronostiqué ce match.</p>';
      return;
    }
    liste.innerHTML = '';
    reponse.groupes.forEach((g, index) => {
      const bloc = document.createElement('div');
      bloc.className = 'groupe-autres-pronos';

      const choix = document.createElement('div');
      choix.className = 'choix-autres-pronos' + (index === 0 && !g.sansProno ? ' majoritaire' : '');
      choix.textContent = g.choix;

      const joueursEtTotal = document.createElement('div');
      joueursEtTotal.className = 'joueurs-autres-pronos';
      const totalSpan = index === 0 && !g.sansProno ? 'total-autres-pronos majoritaire' : 'total-autres-pronos';
      joueursEtTotal.innerHTML = `<span class="${totalSpan}">${g.total}</span> — ${g.joueurs.join(', ')}`;

      bloc.appendChild(choix);
      bloc.appendChild(joueursEtTotal);
      liste.appendChild(bloc);
    });
  });

  conteneur.appendChild(btn);
  conteneur.appendChild(liste);
  return conteneur;
}

// Noms d'affichage propres, sans toucher aux noms bruts stockés dans le
// Sheet (nécessaires tels quels pour la correspondance SofaScore).
// Purement cosmétique, comme NOMS_COURTS_ sur Challenge L1.
const NOMS_AFFICHAGE_ = {
  'PAE AEK': 'AEK Athens',
  'LASK Linz': 'LASK',
  'Lille OSC': 'Lille',
  'FK Shakhtar Donetsk': 'Shakhtar Donetsk',
  'Sabah FK': 'Sabah',
};
function nomAffichage_(nom) {
  return NOMS_AFFICHAGE_[nom] || nom;
}

const JOURS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

function formaterDateHeure_(dateHeureStr) {
  if (!dateHeureStr) return '';
  const d = new Date(dateHeureStr);
  const jour = JOURS_FR[d.getDay()];
  const mois = MOIS_FR[d.getMonth()];
  const heures = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${jour} ${d.getDate()} ${mois} · ${heures}:${minutes}`;
}

function libelleProno1n2_(valeur, domicile, exterieur) {
  if (valeur === '1') return nomAffichage_(domicile);
  if (valeur === '2') return nomAffichage_(exterieur);
  if (valeur === 'N') return 'Nul';
  return valeur;
}

function minutesEcoulees_(dateHeureStr) {
  const debut = new Date(dateHeureStr);
  const minutes = Math.floor((new Date() - debut) / 60000);
  return minutes < 0 ? 0 : minutes;
}

// Détermine si le prono du joueur était bon (null si pas encore
// déterminable : match pas fini, ou pas de prono saisi).
function pronoCorrect_(m) {
  if (!m.termine || m.scoreDom === null || m.scoreExt === null) return null;
  const resultatReel = m.scoreDom > m.scoreExt ? '1' : (m.scoreDom < m.scoreExt ? '2' : 'N');
  if (m.typeProno === 'ScoreExact') {
    if (m.pronoScoreDom === null || m.pronoScoreExt === null) return null;
    const pronoResultat = m.pronoScoreDom > m.pronoScoreExt ? '1' : (m.pronoScoreDom < m.pronoScoreExt ? '2' : 'N');
    return pronoResultat === resultatReel;
  }
  if (!m.pronoJoueur) return null;
  return m.pronoJoueur === resultatReel;
}

function construireLigneMatch(m) {
  const ligne = document.createElement('div');
  ligne.className = 'ligne-match';

  // Liseret de couleur : bleu tant que verrouillé/en direct, puis
  // vert/rouge une fois terminé selon si le prono était bon.
  if (m.termine) {
    const correct = pronoCorrect_(m);
    if (correct === true) ligne.classList.add('bordure-bonne');
    else if (correct === false) ligne.classList.add('bordure-mauvaise');
  } else if (m.verrouille) {
    ligne.classList.add('bordure-verrouille');
  }

  const entete = document.createElement('div');
  entete.className = 'entete-match';
  const spanDom = document.createElement('span');
  spanDom.className = 'equipe-nom';
  spanDom.textContent = nomAffichage_(m.domicile);
  const spanVs = document.createElement('span');
  spanVs.className = 'vs';
  spanVs.textContent = 'vs';
  const spanExt = document.createElement('span');
  spanExt.className = 'equipe-nom';
  spanExt.textContent = nomAffichage_(m.exterieur);
  entete.appendChild(spanDom);
  entete.appendChild(spanVs);
  entete.appendChild(spanExt);

  const statutIcone = document.createElement('span');
  statutIcone.className = 'statut-match';
  statutIcone.textContent = m.verrouille ? '🔒' : '';
  if (m.verrouille) statutIcone.classList.add('locked');
  entete.appendChild(statutIcone);
  ligne.appendChild(entete);

  if (m.termine || m.enCours) {
    const blocScore = document.createElement('div');
    blocScore.className = 'bloc-score-match';
    const score = document.createElement('p');
    score.className = m.enCours ? 'score-match score-live' : 'score-match score-fini';
    score.textContent = `${m.scoreDom} - ${m.scoreExt}`;
    blocScore.appendChild(score);
    const sousTexte = document.createElement('p');
    sousTexte.className = 'sous-score-match';
    if (m.enCours) {
      sousTexte.textContent = `${m.minuteDirect !== null ? m.minuteDirect : minutesEcoulees_(m.dateHeure)}'`;
    } else {
      sousTexte.textContent = m.pointsGagnes > 0 ? `+${m.pointsGagnes} pts` : '0 pt';
      sousTexte.classList.add(m.pointsGagnes > 0 ? 'points-positifs' : 'points-nuls');
    }
    blocScore.appendChild(sousTexte);
    ligne.appendChild(blocScore);
  }

  const dateHeure = document.createElement('p');
  dateHeure.className = 'note date-match';
  dateHeure.textContent = formaterDateHeure_(m.dateHeure);
  ligne.appendChild(dateHeure);

  if (m.verrouille) {
    const monProno = document.createElement('p');
    monProno.className = 'mon-prono';
    if (m.typeProno === 'ScoreExact') {
      monProno.textContent = (m.pronoScoreDom !== null && m.pronoScoreExt !== null)
        ? `Ton prono : ${m.pronoScoreDom} - ${m.pronoScoreExt}`
        : 'Tu n\'as pas pronostiqué ce match.';
    } else {
      monProno.textContent = m.pronoJoueur
        ? `Ton prono : ${libelleProno1n2_(m.pronoJoueur, m.domicile, m.exterieur)}`
        : 'Tu n\'as pas pronostiqué ce match.';
    }
    ligne.appendChild(monProno);
    ligne.appendChild(construireBoutonAutresPronos_(m.id));
    return ligne;
  }

  if (m.typeProno === 'ScoreExact') {
    const bloc = document.createElement('div');
    bloc.className = 'bloc-score-exact';

    const inputs = document.createElement('div');
    inputs.className = 'inputs-score';
    const inD = document.createElement('input');
    inD.type = 'number'; inD.className = 'no-spin'; inD.min = '0'; inD.max = '20';
    if (m.pronoScoreDom !== null) inD.value = m.pronoScoreDom;
    const inE = document.createElement('input');
    inE.type = 'number'; inE.className = 'no-spin'; inE.min = '0'; inE.max = '20';
    if (m.pronoScoreExt !== null) inE.value = m.pronoScoreExt;
    const declencher = () => {
      if (inD.value === '' || inE.value === '') return;
      enregistrerProno(m.id, { scoreDom: inD.value, scoreExt: inE.value });
    };
    inD.addEventListener('change', declencher);
    inE.addEventListener('change', declencher);
    inputs.appendChild(inD);
    const tiret = document.createElement('span'); tiret.className = 'tiret-score'; tiret.textContent = '-';
    inputs.appendChild(tiret);
    inputs.appendChild(inE);
    bloc.appendChild(inputs);
    ligne.appendChild(bloc);
  } else {
    const boutons = document.createElement('div');
    boutons.className = 'boutons-1n2';
    const cotes = { '1': m.coteDom, 'N': m.coteNul, '2': m.coteExt };
    ['1', 'N', '2'].forEach(val => {
      const colonne = document.createElement('div');
      colonne.className = 'choix-1n2';
      const btn = document.createElement('button');
      btn.textContent = val;
      if (m.pronoJoueur === val) btn.classList.add('choisi');
      btn.addEventListener('click', () => {
        boutons.querySelectorAll('button').forEach(b => b.classList.remove('choisi'));
        btn.classList.add('choisi');
        enregistrerProno(m.id, { prono1n2: val });
      });
      colonne.appendChild(btn);
      if (cotes[val]) {
        const cote = document.createElement('span');
        cote.className = 'cote';
        cote.textContent = cotes[val];
        colonne.appendChild(cote);
      }
      boutons.appendChild(colonne);
    });
    ligne.appendChild(boutons);
  }

  return ligne;
}

async function enregistrerProno(idMatch, valeurs) {
  const reponse = await apiPost('enregistrerProno', {
    idMatch,
    idJoueurCible: idJoueurAffiche,
    ...valeurs,
  });
  if (reponse.erreur) alert(reponse.erreur);
}

// --- Ecran Pronos : spéciaux ---

async function chargerSpeciaux() {
  const [equipes, buteurs, reponse] = await Promise.all([
    apiGet('equipes'),
    apiGet('buteurs'),
    apiGet('speciauxJoueur', { token: getToken() }),
  ]);

  [document.getElementById('speciaux-finaliste-1'), document.getElementById('speciaux-finaliste-2')].forEach(select => {
    select.innerHTML = '<option value="">Choisis une équipe</option>';
    (equipes || []).forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.nom;
      opt.textContent = e.cote ? `${e.nom} (${e.cote})` : e.nom;
      select.appendChild(opt);
    });
  });

  const selectButeur = document.getElementById('speciaux-buteur');
  selectButeur.innerHTML = '<option value="">Choisis un joueur</option>';
  (buteurs || []).forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.nom;
    opt.textContent = b.cote ? `${b.nom} (${b.cote})` : b.nom;
    selectButeur.appendChild(opt);
  });

  const edition = document.getElementById('speciaux-edition');
  const verrouille = document.getElementById('speciaux-verrouille');

  if (reponse && reponse.verrouille) {
    edition.style.display = 'none';
    verrouille.style.display = 'block';
    document.getElementById('speciaux-recap').innerHTML = `
      <p>Vainqueur : ${reponse.finaliste1 || '–'}${reponse.coteFinaliste1 ? ` (${reponse.coteFinaliste1})` : ''} · Finaliste : ${reponse.finaliste2 || '–'}${reponse.coteFinaliste2 ? ` (${reponse.coteFinaliste2})` : ''}</p>
      <p>Buteur : ${reponse.buteur || '–'}${reponse.coteButeur ? ` (${reponse.coteButeur})` : ''}</p>
    `;
    chargerSpeciauxDesAutres();
  } else {
    edition.style.display = 'block';
    verrouille.style.display = 'none';
    if (reponse) {
      document.getElementById('speciaux-finaliste-1').value = reponse.finaliste1 || '';
      document.getElementById('speciaux-finaliste-2').value = reponse.finaliste2 || '';
      document.getElementById('speciaux-buteur').value = reponse.buteur || '';
    }
  }
}

async function chargerSpeciauxDesAutres() {
  const conteneur = document.getElementById('speciaux-autres');
  conteneur.innerHTML = '<p class="note">Chargement...</p>';

  const reponse = await apiGet('speciauxDesAutres', { token: getToken() });
  if (!reponse || !reponse.verrouille || !reponse.joueurs.length) {
    conteneur.innerHTML = '';
    return;
  }

  conteneur.innerHTML = '<p style="font-weight:600;margin-bottom:8px">Les pronos des autres</p>';
  reponse.joueurs.forEach(j => {
    const ligne = document.createElement('p');
    ligne.className = 'note';
    ligne.style.marginBottom = '6px';
    if (!j.finaliste1 && !j.buteur) {
      ligne.textContent = `${j.nom} — pas de prono`;
    } else {
      ligne.textContent = `${j.nom} — Vainqueur : ${j.finaliste1 || '–'} · Finaliste : ${j.finaliste2 || '–'} · Buteur : ${j.buteur || '–'}`;
    }
    conteneur.appendChild(ligne);
  });
}

async function sauvegarderSpeciaux() {
  const finaliste1 = document.getElementById('speciaux-finaliste-1').value;
  const finaliste2 = document.getElementById('speciaux-finaliste-2').value;
  const buteur = document.getElementById('speciaux-buteur').value;
  const statut = document.getElementById('statut-speciaux');

  const reponse = await apiPost('enregistrerSpeciaux', { finaliste1, finaliste2, buteur });
  statut.textContent = reponse.erreur || 'Enregistré.';
}

// --- Ecran Classement ---

function rendreLignesClassement_(corps, classement) {
  corps.innerHTML = '';
  if (!Array.isArray(classement)) {
    const message = (classement && classement.erreur) ? classement.erreur : 'Erreur inconnue lors du chargement.';
    corps.innerHTML = `<tr><td colspan="6" class="note">Erreur : ${message}</td></tr>`;
    return;
  }

  classement.forEach(c => {
    const tr = document.createElement('tr');
    if (c.rang === 1) tr.className = 'rang-or';
    else if (c.rang === 2) tr.className = 'rang-argent';
    else if (c.rang === 3) tr.className = 'rang-bronze';

    const delta = c.delta === null ? '–' : (c.delta > 0 ? `▲${c.delta}` : (c.delta < 0 ? `▼${Math.abs(c.delta)}` : '–'));
    const classeDelta = c.delta > 0 ? 'delta-hausse' : (c.delta < 0 ? 'delta-baisse' : 'delta-stable');

    tr.innerHTML = `<td class="${classeDelta}">${delta}</td><td>${c.rang}</td><td>${c.nom}</td><td>${c.points.toFixed(2)}</td><td>${c.paye ? '✅' : '❌'}</td><td>${c.gain ? c.gain + '€' : '–'}</td>`;
    corps.appendChild(tr);
  });
}

async function chargerClassement() {
  const corps = document.getElementById('corps-classement');
  corps.innerHTML = '<tr><td colspan="6" class="note">Chargement...</td></tr>';
  try {
    const classement = await apiGet('classement');
    rendreLignesClassement_(corps, classement);
  } catch (err) {
    corps.innerHTML = '<tr><td colspan="6" class="note">Connexion au serveur impossible. Réessaie dans un instant.</td></tr>';
  }
}

async function chargerClassementHR() {
  const corps = document.getElementById('corps-classement-hr');
  corps.innerHTML = '<tr><td colspan="6" class="note">Chargement...</td></tr>';
  try {
    const classement = await apiGet('classementHR');
    rendreLignesClassement_(corps, classement);
  } catch (err) {
    corps.innerHTML = '<tr><td colspan="6" class="note">Connexion au serveur impossible. Réessaie dans un instant.</td></tr>';
  }
}

// --- Ecran Admin ---

document.addEventListener('DOMContentLoaded', () => {
  const btnAjouter = document.getElementById('btn-admin-ajouter');
  if (btnAjouter) btnAjouter.addEventListener('click', async () => {
    const nom = document.getElementById('admin-ajout-nom').value;
    const prenom = document.getElementById('admin-ajout-prenom').value;
    const motDePasse = document.getElementById('admin-ajout-mdp').value;
    const admin = document.getElementById('admin-ajout-admin').checked;
    const statut = document.getElementById('statut-admin-ajouter');
    const reponse = await apiPost('ajouterJoueur', { nom, prenom, motDePasse, admin });
    statut.textContent = reponse.erreur || 'Joueur ajouté.';
  });

  const selectMdp = document.getElementById('admin-mdp-joueur');
  const btnMdp = document.getElementById('btn-admin-mdp');
  if (btnMdp && selectMdp) {
    apiGet('joueurs').then(joueurs => {
      selectMdp.innerHTML = '';
      (joueurs || []).forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = j.nomAffiche;
        selectMdp.appendChild(opt);
      });
    });
    btnMdp.addEventListener('click', async () => {
      const idJoueur = selectMdp.value;
      const nouveauMotDePasse = document.getElementById('admin-mdp-nouveau').value;
      const statut = document.getElementById('statut-admin-mdp');
      if (!nouveauMotDePasse) return;
      const reponse = await apiPost('reinitialiserMotDePasse', { idJoueur, nouveauMotDePasse });
      statut.textContent = reponse.erreur || 'Mot de passe réinitialisé.';
    });
  }

  const selectRetrait = document.getElementById('admin-joueur-retrait');
  const btnRetirer = document.getElementById('btn-admin-retirer');
  if (btnRetirer && selectRetrait) {
    apiGet('joueurs').then(joueurs => {
      selectRetrait.innerHTML = '';
      (joueurs || []).forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = j.nomAffiche;
        selectRetrait.appendChild(opt);
      });
    });
    btnRetirer.addEventListener('click', async () => {
      const idJoueur = selectRetrait.value;
      const statut = document.getElementById('statut-admin-retirer');
      if (!idJoueur) return;
      if (!confirm('Retirer ce joueur ? Ses pronos existants ne seront pas supprimés.')) return;
      const reponse = await apiPost('supprimerJoueur', { idJoueur });
      statut.textContent = reponse.erreur || 'Joueur retiré.';
    });
  }

  const selectJourneeHoraires = document.getElementById('admin-journee-horaires');
  const btnChargerHoraires = document.getElementById('btn-admin-charger-horaires');
  if (selectJourneeHoraires && btnChargerHoraires) {
    selectJourneeHoraires.innerHTML = '';
    for (let n = 1; n <= TOTAL_JOURNEES; n++) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = `Journée ${n}`;
      selectJourneeHoraires.appendChild(opt);
    }

    btnChargerHoraires.addEventListener('click', async () => {
      const journee = selectJourneeHoraires.value;
      const conteneur = document.getElementById('admin-liste-horaires');
      conteneur.innerHTML = '<p class="note">Chargement...</p>';
      const matchs = await apiPost('matchsAdminJournee', { journee });
      if (!Array.isArray(matchs) || !matchs.length) {
        conteneur.innerHTML = '<p class="note">Aucun match pour cette journée.</p>';
        return;
      }
      conteneur.innerHTML = '';
      matchs.forEach(m => {
        const ligne = document.createElement('div');
        ligne.style.marginBottom = '10px';
        const dateLocale = m.dateHeure ? new Date(m.dateHeure).toISOString().slice(0, 16) : '';
        ligne.innerHTML = `
          <label>${nomAffichage_(m.domicile)} — ${nomAffichage_(m.exterieur)} ${m.verrouManuel ? '🔒' : ''}</label>
          <input type="datetime-local" value="${dateLocale}" data-id-match="${m.idMatch}">
        `;
        const input = ligne.querySelector('input');
        input.addEventListener('change', async () => {
          const reponse = await apiPost('corrigerHoraireAdmin', { idMatch: m.idMatch, dateHeure: input.value });
          document.getElementById('statut-admin-horaires').textContent = reponse.erreur || 'Horaire corrigé et verrouillé.';
        });
        conteneur.appendChild(ligne);
      });
    });
  }

  const btnCotes = document.getElementById('btn-admin-cotes');
  if (btnCotes) btnCotes.addEventListener('click', async () => {
    const journee = document.getElementById('admin-cotes-journee').value;
    const statut = document.getElementById('statut-admin-cotes');
    if (!journee) return;
    statut.textContent = 'Récupération en cours...';
    const reponse = await apiPost('recupererCotesAdmin', { journee });
    if (reponse.erreur) {
      statut.textContent = reponse.erreur;
    } else {
      statut.textContent = `${reponse.corriges} match(s) mis à jour.` + (reponse.echecs.length ? ` Échecs : ${reponse.echecs.join(', ')}` : '');
    }
  });

  const selectHistorique = document.getElementById('admin-historique-joueur');
  const btnHistorique = document.getElementById('btn-admin-historique');
  if (btnHistorique && selectHistorique) {
    apiGet('joueurs').then(joueurs => {
      selectHistorique.innerHTML = '';
      (joueurs || []).forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = j.nomAffiche;
        selectHistorique.appendChild(opt);
      });
    });
    btnHistorique.addEventListener('click', async () => {
      const idJoueurCible = selectHistorique.value;
      const conteneur = document.getElementById('admin-historique-liste');
      conteneur.innerHTML = '<p class="note">Chargement...</p>';
      const lignes = await apiPost('historiqueJoueur', { idJoueurCible });
      if (!Array.isArray(lignes) || !lignes.length) {
        conteneur.innerHTML = '<p class="note">Aucune tentative enregistrée.</p>';
        return;
      }
      conteneur.innerHTML = '';
      lignes.forEach(l => {
        const ligne = document.createElement('p');
        ligne.className = 'note';
        ligne.style.marginBottom = '6px';
        ligne.textContent = `${new Date(l.horodatage).toLocaleString('fr-FR')} — match #${l.idMatch} — tenté "${l.valeurTentee}" (avant: "${l.valeurPrecedente || '–'}") — ${l.statut}`;
        conteneur.appendChild(ligne);
      });
    });
  }
});
