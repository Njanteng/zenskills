const express = require('express');
const { pool } = require('../db');
const { paginate } = require('../utils');

const router = express.Router();

// GET /api/projets
router.get('/', async (req, res, next) => {
  try {
    const { search = '', statut, page = 1 } = req.query;
    const { rows } = await pool.query('SELECT * FROM projets ORDER BY LOWER(titre)');
    let list = rows;

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(p =>
        p.titre.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s)
      );
    }

    if (statut === '0' || statut === '1') {
      list = list.filter(p => p.statut === Number(statut));
    }

    res.json(paginate(list, page));
  } catch (err) { next(err); }
});

// POST /api/projets
router.post('/', async (req, res, next) => {
  try {
    const { titre, description = '', statut = 0 } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    const insertRes = await pool.query(
      'INSERT INTO projets (titre, description, statut) VALUES ($1, $2, $3) RETURNING id',
      [titre.trim(), description, statut ? 1 : 0]
    );
    const { rows } = await pool.query('SELECT * FROM projets WHERE id = $1', [insertRes.rows[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/projets/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM projets WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Projet introuvable' });
    const { titre, description = '', statut } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    await pool.query(
      'UPDATE projets SET titre = $1, description = $2, statut = $3 WHERE id = $4',
      [titre.trim(), description, statut ? 1 : 0, id]
    );
    const { rows } = await pool.query('SELECT * FROM projets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/projets/:id/statut
router.patch('/:id/statut', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM projets WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Projet introuvable' });
    await pool.query('UPDATE projets SET statut = $1 WHERE id = $2', [req.body.statut ? 1 : 0, id]);
    const { rows } = await pool.query('SELECT * FROM projets WHERE id = $1', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/projets/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM projets WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Projet introuvable' });
    await pool.query('DELETE FROM projets WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
