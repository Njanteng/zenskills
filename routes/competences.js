const express = require('express');
const { pool } = require('../db');
const { paginate } = require('../utils');

const router = express.Router();

async function attachCours(list, userId) {
  return Promise.all(list.map(async k => {
    const { rows } = await pool.query(`
      SELECT c.id, c.titre, c.statut
      FROM cours c
      JOIN cours_competences cc ON cc.cours_id = c.id
      WHERE cc.competence_id = $1 AND c.user_id = $2
      ORDER BY LOWER(c.titre)
    `, [k.id, userId]);
    return { ...k, cours: rows };
  }));
}

function normalizeNiveau(statut, niveau) {
  if (!statut) return null;
  const n = Number(niveau);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

router.get('/', async (req, res, next) => {
  try {
    const { search = '', cours, page = 1 } = req.query;
    const { rows } = await pool.query('SELECT * FROM competences WHERE user_id = $1 ORDER BY LOWER(nom)', [req.userId]);
    let list = await attachCours(rows, req.userId);

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

router.get('/all', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM competences WHERE user_id = $1 ORDER BY LOWER(nom)', [req.userId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { nom, description = '', statut = 0, niveau_maitrise } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);
    const insertRes = await pool.query(
      'INSERT INTO competences (user_id, nom, description, statut, niveau_maitrise) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.userId, nom.trim(), description, finalStatut, finalNiveau]
    );
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [insertRes.rows[0].id]);
    const [withCours] = await attachCours(rows, req.userId);
    res.status(201).json(withCours);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    const { nom, description = '', statut, niveau_maitrise } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);
    await pool.query(
      'UPDATE competences SET nom = $1, description = $2, statut = $3, niveau_maitrise = $4 WHERE id = $5 AND user_id = $6',
      [nom.trim(), description, finalStatut, finalNiveau, id, req.userId]
    );
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows, req.userId);
    res.json(withCours);
  } catch (err) { next(err); }
});

router.patch('/:id/statut', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    const finalStatut = req.body.statut ? 1 : 0;
    const finalNiveau = finalStatut ? existing.rows[0].niveau_maitrise : null;
    await pool.query('UPDATE competences SET statut = $1, niveau_maitrise = $2 WHERE id = $3 AND user_id = $4', [finalStatut, finalNiveau, id, req.userId]);
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows, req.userId);
    res.json(withCours);
  } catch (err) { next(err); }
});

router.patch('/:id/niveau', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    if (!existing.rows[0].statut) return res.status(400).json({ error: 'La compétence doit être acquise pour définir un niveau de maîtrise' });
    const finalNiveau = normalizeNiveau(1, req.body.niveau_maitrise);
    await pool.query('UPDATE competences SET niveau_maitrise = $1 WHERE id = $2 AND user_id = $3', [finalNiveau, id, req.userId]);
    const { rows } = await pool.query('SELECT * FROM competences WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows, req.userId);
    res.json(withCours);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM competences WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Compétence introuvable' });
    await pool.query('DELETE FROM competences WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
