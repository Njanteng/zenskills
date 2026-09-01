const express = require('express');
const { pool } = require('../db');
const { CATEGORIES, FORMATS } = require('../constants');
const { paginate } = require('../utils');

const router = express.Router();

async function attachExtras(rows, userId) {
  if (rows.length === 0) return [];
  const ids = rows.map(c => c.id);

  const [compRes, nbRes] = await Promise.all([
    pool.query(`
      SELECT cc.cours_id, co.id, co.nom, co.description, co.statut, co.niveau_maitrise
      FROM cours_competences cc
      JOIN competences co ON co.id = cc.competence_id
      WHERE cc.cours_id = ANY($1::int[]) AND co.user_id = $2
      ORDER BY LOWER(co.nom)
    `, [ids, userId]),
    pool.query(`
      SELECT cours_id, COUNT(*)::int AS n
      FROM parcours_cours
      WHERE cours_id = ANY($1::int[])
      GROUP BY cours_id
    `, [ids])
  ]);

  const competencesByCours = new Map();
  for (const row of compRes.rows) {
    const { cours_id, ...comp } = row;
    if (!competencesByCours.has(cours_id)) competencesByCours.set(cours_id, []);
    competencesByCours.get(cours_id).push(comp);
  }
  const nbParcoursByCours = new Map(nbRes.rows.map(r => [r.cours_id, r.n]));

  return rows.map(c => ({
    ...c,
    competences: competencesByCours.get(c.id) || [],
    nb_parcours: nbParcoursByCours.get(c.id) || 0
  }));
}

function normalizeNiveau(statut, niveau) {
  if (!statut) return null;
  const n = Number(niveau);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

router.get('/categories', (req, res) => res.json(CATEGORIES));
router.get('/formats', (req, res) => res.json(FORMATS));

router.get('/all', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, titre FROM cours WHERE user_id = $1 ORDER BY LOWER(titre)', [req.userId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { search = '', statut, type, competence, categorie, format, niveau, page = 1 } = req.query;

    const { rows } = await pool.query('SELECT * FROM cours WHERE user_id = $1 ORDER BY LOWER(titre)', [req.userId]);
    let list = await attachExtras(rows, req.userId);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(c =>
        c.titre.toLowerCase().includes(s) || (c.description || '').toLowerCase().includes(s)
      );
    }
    if (statut === '0' || statut === '1') list = list.filter(c => c.statut === Number(statut));
    if (categorie) list = list.filter(c => c.categorie === categorie);
    if (format) list = list.filter(c => c.format === format);
    if (niveau) list = list.filter(c => c.niveau_maitrise === Number(niveau));
    if (competence) {
      const compId = Number(competence);
      list = list.filter(c => c.competences.some(k => k.id === compId));
    }
    if (type === 'Obligatoire' || type === 'Optionnel') {
      const linkRes = await pool.query(`
        SELECT DISTINCT pc.cours_id FROM parcours_cours pc
        JOIN parcours p ON p.id = pc.parcours_id
        WHERE pc.type = $1 AND p.user_id = $2
      `, [type, req.userId]);
      const idsWithType = new Set(linkRes.rows.map(r => r.cours_id));
      list = list.filter(c => idsWithType.has(c.id));
    }

    res.json(paginate(list, page));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    const [withExtras] = await attachExtras(rows, req.userId);
    res.json(withExtras);
  } catch (err) { next(err); }
});

// Vérifie que les compétences fournies appartiennent bien à l'utilisateur avant de les lier.
async function filterOwnedCompetenceIds(ids, userId) {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    'SELECT id FROM competences WHERE user_id = $1 AND id = ANY($2::int[])',
    [userId, ids]
  );
  return rows.map(r => r.id);
}

router.post('/', async (req, res, next) => {
  try {
    const { titre, description = '', categorie, format, statut = 0, niveau_maitrise, competences = [] } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    if (!CATEGORIES.includes(categorie)) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!FORMATS.includes(format)) return res.status(400).json({ error: 'Format invalide' });

    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);

    const insertRes = await pool.query(
      'INSERT INTO cours (user_id, titre, description, statut, categorie, format, niveau_maitrise) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [req.userId, titre.trim(), description, finalStatut, categorie, format, finalNiveau]
    );
    const coursId = insertRes.rows[0].id;

    const ownedCompIds = await filterOwnedCompetenceIds(competences.map(Number), req.userId);
    for (const compId of ownedCompIds) {
      await pool.query('INSERT INTO cours_competences (cours_id, competence_id) VALUES ($1, $2)', [coursId, compId]);
    }

    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [coursId]);
    const [withExtras] = await attachExtras(rows, req.userId);
    res.status(201).json(withExtras);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });

    const { titre, description = '', categorie, format, statut, niveau_maitrise, competences = [] } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    if (!CATEGORIES.includes(categorie)) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!FORMATS.includes(format)) return res.status(400).json({ error: 'Format invalide' });

    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);

    await pool.query(
      'UPDATE cours SET titre = $1, description = $2, statut = $3, categorie = $4, format = $5, niveau_maitrise = $6 WHERE id = $7 AND user_id = $8',
      [titre.trim(), description, finalStatut, categorie, format, finalNiveau, id, req.userId]
    );

    await pool.query('DELETE FROM cours_competences WHERE cours_id = $1', [id]);
    const ownedCompIds = await filterOwnedCompetenceIds(competences.map(Number), req.userId);
    for (const compId of ownedCompIds) {
      await pool.query('INSERT INTO cours_competences (cours_id, competence_id) VALUES ($1, $2)', [id, compId]);
    }

    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows, req.userId);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.patch('/:id/statut', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    const finalStatut = req.body.statut ? 1 : 0;
    const finalNiveau = finalStatut ? existing.rows[0].niveau_maitrise : null;
    await pool.query('UPDATE cours SET statut = $1, niveau_maitrise = $2 WHERE id = $3 AND user_id = $4', [finalStatut, finalNiveau, id, req.userId]);
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows, req.userId);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.patch('/:id/niveau', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    if (!existing.rows[0].statut) return res.status(400).json({ error: 'Le cours doit être terminé pour définir un niveau de maîtrise' });
    const finalNiveau = normalizeNiveau(1, req.body.niveau_maitrise);
    await pool.query('UPDATE cours SET niveau_maitrise = $1 WHERE id = $2 AND user_id = $3', [finalNiveau, id, req.userId]);
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows, req.userId);
    res.json(withExtras);
  } catch (err) { next(err); }
});

// PATCH /api/cours/:id/revision — marque le cours comme révisé aujourd'hui.
router.patch('/:id/revision', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    if (!existing.rows[0].statut) return res.status(400).json({ error: 'Le cours doit être terminé pour enregistrer une révision' });
    await pool.query('UPDATE cours SET derniere_revision = CURRENT_DATE WHERE id = $1 AND user_id = $2', [id, req.userId]);
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows, req.userId);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    await pool.query('DELETE FROM cours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
