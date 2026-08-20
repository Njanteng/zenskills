const express = require('express');
const { pool } = require('../db');
const { paginate } = require('../utils');

const router = express.Router();

async function attachCours(list) {
  return Promise.all(list.map(async k => {
    const { rows } = await pool.query(`
      SELECT c.id, c.titre, c.statut
      FROM cours c
      JOIN cours_competences cc ON cc.cours_id = c.id
      WHERE cc.competence_id = $1
      ORDER BY LOWER(c.titre)
    `, [k.id]);
    return { ...k, cours: rows };
  }));
}

// Un niveau de maîtrise n'a de sens que sur une compétence acquise.
function normalizeNiveau(statut, niveau) {
  if (!statut) return null;
  const n = Number(niveau);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

// GET /api/competences
router.get('/', async (req, res, next) => {
  try {
    const { search = '', cours, page = 1 } = req.query;

    const { rows } = await pool.query('SELECT * FROM competences ORDER BY LOWER(nom)');
    let list = await attachCours(rows);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(k =>
        k.nom.toLowerCase().includes(s) || (k.description || '').toLowerCase().includes(s)
      );
    }

    if (cours) {
      const coursId = Number(cours);
      list = list.filter(k => k.cours.some(c => c.id === coursId));
    }

    res.json(paginate(list, page));
  } catch (err) { next(err); }
});

// GET /api/competences/all (liste complète non paginée, utile pour les sélecteurs)
router.get('/all', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM competences ORDER BY LOWER(nom)');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/competences
router.post('/', async (req, res, next) => {
  try {
    const { nom, description = '', statut = 0, niveau_maitrise } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);
    const insertRes = await pool.query(
      'INSERT INTO competences (nom, description, statut, niveau_maitrise) VALUES ($1, $2, $3, $4) RETURNING id',
      [nom.trim(), description, finalStatut, finalNiveau]
    );
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [insertRes.rows[0].id]);
    const [withCours] = await attachCours(rows);
    res.status(201).json(withCours);
  } catch (err) { next(err); }
});

// PUT /api/competences/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    const { nom, description = '', statut, niveau_maitrise } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);
    await pool.query(
      'UPDATE competences SET nom = $1, description = $2, statut = $3, niveau_maitrise = $4 WHERE id = $5',
      [nom.trim(), description, finalStatut, finalNiveau, id]
    );
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows);
    res.json(withCours);
  } catch (err) { next(err); }
});

// PATCH /api/competences/:id/statut  -> marque acquise (propagation implicite : champ partagé)
router.patch('/:id/statut', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    const finalStatut = req.body.statut ? 1 : 0;
    // Si on décoche "acquise", on vide le niveau de maîtrise.
    const finalNiveau = finalStatut ? existing.rows[0].niveau_maitrise : null;
    await pool.query('UPDATE competences SET statut = $1, niveau_maitrise = $2 WHERE id = $3', [finalStatut, finalNiveau, id]);
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows);
    res.json(withCours);
  } catch (err) { next(err); }
});

// PATCH /api/competences/:id/niveau  (mise à jour rapide du niveau de maîtrise seul)
router.patch('/:id/niveau', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    if (!existing.rows[0].statut) return res.status(400).json({ error: 'La compétence doit être acquise pour définir un niveau de maîtrise' });
    const finalNiveau = normalizeNiveau(1, req.body.niveau_maitrise);
    await pool.query('UPDATE competences SET niveau_maitrise = $1 WHERE id = $2', [finalNiveau, id]);
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows);
    res.json(withCours);
  } catch (err) { next(err); }
});

// DELETE /api/competences/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    await pool.query('DELETE FROM competences WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
