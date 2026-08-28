const express = require('express');
const { pool } = require('../db');
const { CATEGORIES, FORMATS } = require('../constants');
const { paginate } = require('../utils');

const router = express.Router();

async function attachExtras(rows) {
  return Promise.all(rows.map(async c => {
    const [compRes, nbRes] = await Promise.all([
      pool.query(`
        SELECT co.id, co.nom, co.description, co.statut, co.niveau_maitrise
        FROM competences co
        JOIN cours_competences cc ON cc.competence_id = co.id
        WHERE cc.cours_id = $1
        ORDER BY LOWER(co.nom)
      `, [c.id]),
      pool.query('SELECT COUNT(*)::int AS n FROM parcours_cours WHERE cours_id = $1', [c.id])
    ]);
    return { ...c, competences: compRes.rows, nb_parcours: nbRes.rows[0].n };
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

// GET /api/cours/all (liste légère, utile pour les sélecteurs — ex. modale de tâche)
router.get('/all', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, titre FROM cours ORDER BY LOWER(titre)');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { search = '', statut, type, competence, categorie, format, niveau, page = 1 } = req.query;

    const { rows } = await pool.query('SELECT * FROM cours ORDER BY LOWER(titre)');
    let list = await attachExtras(rows);

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
      const linkRes = await pool.query('SELECT DISTINCT cours_id FROM parcours_cours WHERE type = $1', [type]);
      const idsWithType = new Set(linkRes.rows.map(r => r.cours_id));
      list = list.filter(c => idsWithType.has(c.id));
    }

    res.json(paginate(list, page));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    const [withExtras] = await attachExtras(rows);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { titre, description = '', categorie, format, statut = 0, niveau_maitrise, competences = [] } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    if (!CATEGORIES.includes(categorie)) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!FORMATS.includes(format)) return res.status(400).json({ error: 'Format invalide' });

    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);

    const insertRes = await pool.query(
      'INSERT INTO cours (titre, description, statut, categorie, format, niveau_maitrise) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [titre.trim(), description, finalStatut, categorie, format, finalNiveau]
    );
    const coursId = insertRes.rows[0].id;

    for (const compId of competences) {
      await pool.query('INSERT INTO cours_competences (cours_id, competence_id) VALUES ($1, $2)', [coursId, compId]);
    }

    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [coursId]);
    const [withExtras] = await attachExtras(rows);
    res.status(201).json(withExtras);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });

    const { titre, description = '', categorie, format, statut, niveau_maitrise, competences = [] } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });
    if (!CATEGORIES.includes(categorie)) return res.status(400).json({ error: 'Catégorie invalide' });
    if (!FORMATS.includes(format)) return res.status(400).json({ error: 'Format invalide' });

    const finalStatut = statut ? 1 : 0;
    const finalNiveau = normalizeNiveau(finalStatut, niveau_maitrise);

    await pool.query(
      'UPDATE cours SET titre = $1, description = $2, statut = $3, categorie = $4, format = $5, niveau_maitrise = $6 WHERE id = $7',
      [titre.trim(), description, finalStatut, categorie, format, finalNiveau, id]
    );

    await pool.query('DELETE FROM cours_competences WHERE cours_id = $1', [id]);
    for (const compId of competences) {
      await pool.query('INSERT INTO cours_competences (cours_id, competence_id) VALUES ($1, $2)', [id, compId]);
    }

    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.patch('/:id/statut', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    const finalStatut = req.body.statut ? 1 : 0;
    const finalNiveau = finalStatut ? existing.rows[0].niveau_maitrise : null;
    await pool.query('UPDATE cours SET statut = $1, niveau_maitrise = $2 WHERE id = $3', [finalStatut, finalNiveau, id]);
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.patch('/:id/niveau', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    if (!existing.rows[0].statut) return res.status(400).json({ error: 'Le cours doit être terminé pour définir un niveau de maîtrise' });
    const finalNiveau = normalizeNiveau(1, req.body.niveau_maitrise);
    await pool.query('UPDATE cours SET niveau_maitrise = $1 WHERE id = $2', [finalNiveau, id]);
    const { rows } = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    const [withExtras] = await attachExtras(rows);
    res.json(withExtras);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM cours WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cours introuvable' });
    await pool.query('DELETE FROM cours WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
