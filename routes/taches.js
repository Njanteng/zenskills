const express = require('express');
const { pool } = require('../db');
const { paginate } = require('../utils');

const router = express.Router();

const LIEN_TYPES = ['cours', 'parcours', 'projet'];

async function attachLien(rows) {
  return Promise.all(rows.map(async t => {
    let lien = null;
    if (t.cours_id) {
      const { rows: r } = await pool.query('SELECT id, titre FROM cours WHERE id = $1', [t.cours_id]);
      if (r[0]) lien = { type: 'cours', id: r[0].id, titre: r[0].titre };
    } else if (t.parcours_id) {
      const { rows: r } = await pool.query('SELECT id, titre FROM parcours WHERE id = $1', [t.parcours_id]);
      if (r[0]) lien = { type: 'parcours', id: r[0].id, titre: r[0].titre };
    } else if (t.projet_id) {
      const { rows: r } = await pool.query('SELECT id, titre FROM projets WHERE id = $1', [t.projet_id]);
      if (r[0]) lien = { type: 'projet', id: r[0].id, titre: r[0].titre };
    }
    return { ...t, lien };
  }));
}

// Valide { lien_type, lien_id } et vérifie que l'élément appartient bien à l'utilisateur.
async function resolveLien(lien_type, lien_id, userId) {
  const result = { cours_id: null, parcours_id: null, projet_id: null };
  if (!lien_type) return result;
  if (!LIEN_TYPES.includes(lien_type)) {
    throw Object.assign(new Error('Type de lien invalide'), { status: 400 });
  }
  const id = Number(lien_id);
  if (!Number.isInteger(id)) {
    throw Object.assign(new Error('Identifiant de lien invalide'), { status: 400 });
  }
  const table = lien_type === 'cours' ? 'cours' : lien_type === 'parcours' ? 'parcours' : 'projets';
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (rows.length === 0) {
    throw Object.assign(new Error(`${lien_type === 'cours' ? 'Cours' : lien_type === 'parcours' ? 'Parcours' : 'Projet'} introuvable`), { status: 400 });
  }
  if (lien_type === 'cours') result.cours_id = id;
  else if (lien_type === 'parcours') result.parcours_id = id;
  else result.projet_id = id;
  return result;
}

router.get('/', async (req, res, next) => {
  try {
    const { search = '', statut, page = 1 } = req.query;
    const { rows } = await pool.query('SELECT * FROM taches WHERE user_id = $1 ORDER BY id DESC', [req.userId]);
    let list = await attachLien(rows);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(t =>
        t.titre.toLowerCase().includes(s) || (t.description || '').toLowerCase().includes(s)
      );
    }
    if (statut === '0' || statut === '1') list = list.filter(t => t.statut === Number(statut));

    res.json(paginate(list, page));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { titre, description = '', statut = 0, lien_type = null, lien_id = null } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });

    const { cours_id, parcours_id, projet_id } = await resolveLien(lien_type, lien_id, req.userId);

    const insertRes = await pool.query(
      'INSERT INTO taches (user_id, titre, description, statut, cours_id, parcours_id, projet_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.userId, titre.trim(), description, statut ? 1 : 0, cours_id, parcours_id, projet_id]
    );
    const { rows } = await pool.query('SELECT * FROM taches WHERE id = $1', [insertRes.rows[0].id]);
    const [withLien] = await attachLien(rows);
    res.status(201).json(withLien);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM taches WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });

    const { titre, description = '', statut, lien_type = null, lien_id = null } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });

    const { cours_id, parcours_id, projet_id } = await resolveLien(lien_type, lien_id, req.userId);

    await pool.query(
      'UPDATE taches SET titre = $1, description = $2, statut = $3, cours_id = $4, parcours_id = $5, projet_id = $6 WHERE id = $7 AND user_id = $8',
      [titre.trim(), description, statut ? 1 : 0, cours_id, parcours_id, projet_id, id, req.userId]
    );
    const { rows } = await pool.query('SELECT * FROM taches WHERE id = $1', [id]);
    const [withLien] = await attachLien(rows);
    res.json(withLien);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.patch('/:id/statut', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM taches WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });
    await pool.query('UPDATE taches SET statut = $1 WHERE id = $2 AND user_id = $3', [req.body.statut ? 1 : 0, id, req.userId]);
    const { rows } = await pool.query('SELECT * FROM taches WHERE id = $1', [id]);
    const [withLien] = await attachLien(rows);
    res.json(withLien);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM taches WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Tâche introuvable' });
    await pool.query('DELETE FROM taches WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
