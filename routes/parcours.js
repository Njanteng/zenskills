const express = require('express');
const { pool } = require('../db');
const { paginate } = require('../utils');

const router = express.Router();

async function attachCours(list) {
  if (list.length === 0) return [];
  const ids = list.map(p => p.id);

  const { rows } = await pool.query(`
    SELECT pc.parcours_id, c.id, c.titre, c.statut, c.categorie, c.format, c.niveau_maitrise, pc.type, pc.position
    FROM parcours_cours pc
    JOIN cours c ON c.id = pc.cours_id
    WHERE pc.parcours_id = ANY($1::int[])
    ORDER BY pc.position ASC
  `, [ids]);

  const coursByParcours = new Map();
  for (const row of rows) {
    const { parcours_id, ...cours } = row;
    if (!coursByParcours.has(parcours_id)) coursByParcours.set(parcours_id, []);
    coursByParcours.get(parcours_id).push(cours);
  }

  return list.map(p => {
    const cours = coursByParcours.get(p.id) || [];
    const obligatoires = cours.filter(c => c.type === 'Obligatoire');
    const completed = obligatoires.every(c => c.statut === 1);
    return { ...p, cours, completed };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const { search = '', statut, page = 1 } = req.query;
    const { rows } = await pool.query('SELECT * FROM parcours WHERE user_id = $1 ORDER BY LOWER(titre)', [req.userId]);
    let list = await attachCours(rows);

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(p =>
        p.titre.toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s)
      );
    }
    if (statut === '0' || statut === '1') {
      const want = Number(statut) === 1;
      list = list.filter(p => p.completed === want);
    }

    res.json(paginate(list, page));
  } catch (err) { next(err); }
});

router.get('/all', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, titre FROM parcours WHERE user_id = $1 ORDER BY LOWER(titre)', [req.userId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM parcours WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Parcours introuvable' });
    const [withCours] = await attachCours(rows);
    res.json(withCours);
  } catch (err) { next(err); }
});

// Ne conserve que les cours de la liste qui appartiennent bien à l'utilisateur.
async function filterOwnedCoursItems(coursList, userId) {
  if (!coursList.length) return [];
  const ids = coursList.map(item => Number(item.cours_id));
  const { rows } = await pool.query(
    'SELECT id FROM cours WHERE user_id = $1 AND id = ANY($2::int[])',
    [userId, ids]
  );
  const ownedIds = new Set(rows.map(r => r.id));
  return coursList.filter(item => ownedIds.has(Number(item.cours_id)));
}

async function replaceCoursList(parcoursId, coursList, userId) {
  const owned = await filterOwnedCoursItems(coursList, userId);
  await pool.query('DELETE FROM parcours_cours WHERE parcours_id = $1', [parcoursId]);
  let index = 0;
  for (const item of owned) {
    const type = item.type === 'Optionnel' ? 'Optionnel' : 'Obligatoire';
    const position = Number.isInteger(item.position) ? item.position : index;
    await pool.query(
      'INSERT INTO parcours_cours (parcours_id, cours_id, type, position) VALUES ($1, $2, $3, $4)',
      [parcoursId, item.cours_id, type, position]
    );
    index++;
  }
}

router.post('/', async (req, res, next) => {
  try {
    const { titre, description = '', cours = [] } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });

    const insertRes = await pool.query(
      'INSERT INTO parcours (user_id, titre, description) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, titre.trim(), description]
    );
    const parcoursId = insertRes.rows[0].id;
    await replaceCoursList(parcoursId, cours, req.userId);

    const { rows } = await pool.query('SELECT * FROM parcours WHERE id = $1', [parcoursId]);
    const [withCours] = await attachCours(rows);
    res.status(201).json(withCours);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM parcours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Parcours introuvable' });

    const { titre, description = '', cours = [] } = req.body;
    if (!titre || !titre.trim()) return res.status(400).json({ error: 'Le titre est requis' });

    await pool.query('UPDATE parcours SET titre = $1, description = $2 WHERE id = $3 AND user_id = $4', [titre.trim(), description, id, req.userId]);
    await replaceCoursList(id, cours, req.userId);

    const { rows } = await pool.query('SELECT * FROM parcours WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows);
    res.json(withCours);
  } catch (err) { next(err); }
});

router.put('/:id/ordre', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM parcours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Parcours introuvable' });

    const { cours = [] } = req.body;
    await replaceCoursList(id, cours, req.userId);

    const { rows } = await pool.query('SELECT * FROM parcours WHERE id = $1', [id]);
    const [withCours] = await attachCours(rows);
    res.json(withCours);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await pool.query('SELECT * FROM parcours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Parcours introuvable' });
    await pool.query('DELETE FROM parcours WHERE id = $1 AND user_id = $2', [id, req.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
