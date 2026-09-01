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
  const token = getToken();

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
    document.getElementById('liste-side-bets').style.display = mode === 'sidebets' ? 'block' : 'none';
    if (mode === 'general') chargerClassement();
    else if (mode === 'hr') chargerClassementHR();
    else if (mode === 'sidebets') chargerSideBets();
  }));

  // Quoi qu'il arrive côté API (déploiement mal réglé, réseau, etc.),
  // on affiche toujours un écran plutôt que de laisser la page vide.
  try {
    const promesseJoueurs = chargerListeJoueurs();
    const promesseMoi = token ? apiGet('moi', { token }) : Promise.resolve(null);
    const [, reponseMoi] = await Promise.all([promesseJoueurs, promesseMoi]);

    if (reponseMoi && !reponseMoi.erreur) {
      afficherApp(reponseMoi);
      return;
    }
    if (token) clearToken();
  } catch (err) {
    console.error('Erreur au chargement :', err);
    document.getElementById('erreur-connexion').textContent = 'Connexion au serveur impossible. Réessaie dans un instant.';
  }
  document.getElementById('vue-connexion').style.display = 'flex';
}

async function chargerListeJoueurs() {
  const joueurs = await apiGet('joueurs');
  listeJoueursGlobale = Array.isArray(joueurs) ? joueurs : [];
  const select = document.getElementById('select-joueur');
  select.innerHTML = '<option value="">Choisis ton nom</option>';
  listeJoueursGlobale.forEach(j => {
    const opt = document.createElement('option');
    opt.value = j.id;
    opt.textContent = `${j.prenom} ${j.nom}`;
    select.appendChild(opt);
  });
}

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
      opt.textContent = `${j.prenom} ${j.nom}`;
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
  conteneur.innerHTML = '<p class="note">Chargement...</p>';

  const matchs = await apiGet('matchsJournee', { journee: n, token: getToken(), idJoueurCible: idJoueurAffiche });
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
    if (!Array.isArray(reponse) || !reponse.length) {
      liste.innerHTML = '<p class="note">Personne n\'a encore pronostiqué ce match.</p>';
      return;
    }
    liste.innerHTML = '';
    reponse.forEach(pr => {
      const ligne = document.createElement('div');
      ligne.className = 'ligne-autre-prono';
      const valeur = pr.prono1n2 || (pr.scoreDom !== null ? `${pr.scoreDom} - ${pr.scoreExt}` : '–');
      ligne.innerHTML = `<span>${pr.nom}</span><span>${valeur}</span>`;
      liste.appendChild(ligne);
    });
  });

  conteneur.appendChild(btn);
  conteneur.appendChild(liste);
  return conteneur;
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

function construireLigneMatch(m) {
  const ligne = document.createElement('div');
  ligne.className = 'ligne-match';

  const entete = document.createElement('div');
  entete.className = 'entete-match';
  const spanDom = document.createElement('span');
  spanDom.className = 'equipe-nom';
  spanDom.textContent = m.domicile;
  const spanVs = document.createElement('span');
  spanVs.className = 'vs';
  if (m.termine) {
    spanVs.textContent = `${m.scoreDom} - ${m.scoreExt}`;
    spanVs.classList.add('score-fini');
  } else if (m.enCours) {
    spanVs.textContent = `${m.scoreDom} - ${m.scoreExt} ● LIVE`;
    spanVs.classList.add('score-live');
  } else {
    spanVs.textContent = 'vs';
  }
  const spanExt = document.createElement('span');
  spanExt.className = 'equipe-nom';
  spanExt.textContent = m.exterieur;
  entete.appendChild(spanDom);
  entete.appendChild(spanVs);
  entete.appendChild(spanExt);

  const statutIcone = document.createElement('span');
  statutIcone.className = 'statut-match';
  statutIcone.textContent = m.verrouille ? '🔒' : '';
  if (m.verrouille) statutIcone.classList.add('locked');
  entete.appendChild(statutIcone);
  ligne.appendChild(entete);

  const dateHeure = document.createElement('p');
  dateHeure.className = 'note date-match';
  dateHeure.textContent = formaterDateHeure_(m.dateHeure);
  ligne.appendChild(dateHeure);

  if (m.verrouille) {
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
    const inE = document.createElement('input');
    inE.type = 'number'; inE.className = 'no-spin'; inE.min = '0'; inE.max = '20';
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
    ['1', 'N', '2'].forEach(val => {
      const colonne = document.createElement('div');
      colonne.className = 'choix-1n2';
      const btn = document.createElement('button');
      btn.textContent = val;
      btn.addEventListener('click', () => {
        boutons.querySelectorAll('button').forEach(b => b.classList.remove('choisi'));
        btn.classList.add('choisi');
        enregistrerProno(m.id, { prono1n2: val });
      });
      colonne.appendChild(btn);
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
      <p>Vainqueur : ${reponse.finaliste1 || '–'} · Finaliste : ${reponse.finaliste2 || '–'}</p>
      <p>Buteur : ${reponse.buteur || '–'}</p>
    `;
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
  if (!Array.isArray(classement)) return;

  classement.forEach(c => {
    const tr = document.createElement('tr');
    if (c.rang === 1) tr.className = 'rang-or';
    else if (c.rang === 2) tr.className = 'rang-argent';
    else if (c.rang === 3) tr.className = 'rang-bronze';

    const delta = c.delta === null ? '–' : (c.delta > 0 ? `▲${c.delta}` : (c.delta < 0 ? `▼${Math.abs(c.delta)}` : '–'));
    const classeDelta = c.delta > 0 ? 'delta-hausse' : (c.delta < 0 ? 'delta-baisse' : 'delta-stable');

    tr.innerHTML = `<td class="${classeDelta}">${delta}</td><td>${c.rang}</td><td>${c.nom}</td><td>${c.points}</td><td>${c.paye ? '✅' : '❌'}</td>`;
    corps.appendChild(tr);
  });
}

async function chargerClassement() {
  const corps = document.getElementById('corps-classement');
  corps.innerHTML = '<tr><td colspan="5" class="note">Chargement...</td></tr>';
  const classement = await apiGet('classement');
  rendreLignesClassement_(corps, classement);
}

async function chargerClassementHR() {
  const corps = document.getElementById('corps-classement-hr');
  corps.innerHTML = '<tr><td colspan="5" class="note">Chargement...</td></tr>';
  const classement = await apiGet('classementHR');
  rendreLignesClassement_(corps, classement);
}

async function chargerSideBets() {
  const conteneur = document.getElementById('liste-side-bets');
  if (!conteneur) return;
  conteneur.innerHTML = '<p class="note">Chargement...</p>';

  const sideBets = await apiGet('sideBets');
  if (!Array.isArray(sideBets) || !sideBets.length) {
    conteneur.innerHTML = '<p class="note">Aucun side bet en cours.</p>';
    return;
  }

  conteneur.innerHTML = '';
  sideBets.forEach(sb => {
    const j1Mene = sb.joueur1.points >= sb.joueur2.points;
    const ecart = Math.abs(sb.joueur1.points - sb.joueur2.points);
    const carte = document.createElement('div');
    carte.className = 'carte-side-bet';
    carte.innerHTML = `
      <div class="side-bet-joueur ${j1Mene ? 'mene' : ''}">
        <span class="side-bet-nom">${sb.joueur1.prenom} ${sb.joueur1.nom}</span>
        <span class="side-bet-pts">${sb.joueur1.points} pts</span>
      </div>
      <div class="side-bet-vs">VS${sb.mise ? `<br><span class="side-bet-mise">${sb.mise}</span>` : ''}</div>
      <div class="side-bet-joueur ${!j1Mene ? 'mene' : ''}">
        <span class="side-bet-nom">${sb.joueur2.prenom} ${sb.joueur2.nom}</span>
        <span class="side-bet-pts">${sb.joueur2.points} pts</span>
      </div>
      <p class="side-bet-ecart">${j1Mene ? sb.joueur1.prenom : sb.joueur2.prenom} mène de ${ecart} pts</p>
      ${sb.commentaire ? `<p class="side-bet-commentaire">${sb.commentaire}</p>` : ''}
    `;
    conteneur.appendChild(carte);
  });
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

  const selectRetrait = document.getElementById('admin-joueur-retrait');
  const btnRetirer = document.getElementById('btn-admin-retirer');
  if (btnRetirer && selectRetrait) {
    apiGet('joueurs').then(joueurs => {
      selectRetrait.innerHTML = '';
      (joueurs || []).forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.textContent = `${j.prenom} ${j.nom}`;
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
        opt.textContent = `${j.prenom} ${j.nom}`;
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
