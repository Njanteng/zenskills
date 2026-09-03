const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function ratio(rows, statutKey = 'statut') {
  const total = rows.length;
  const done = rows.filter(r => r[statutKey] === 1 || r[statutKey] === true).length;
  return { done, total };
}

router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId;
    const [coursRes, competencesRes, projetsRes, parcoursRes, coursARevoirRes, competencesARevoirRes] = await Promise.all([
      pool.query('SELECT * FROM cours WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM competences WHERE user_id = $1 ORDER BY LOWER(nom)', [userId]),
      pool.query('SELECT * FROM projets WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM parcours WHERE user_id = $1 ORDER BY LOWER(titre)', [userId]),
      pool.query(`
        SELECT id, titre AS nom, derniere_revision
        FROM cours
        WHERE user_id = $1 AND statut = 1
        ORDER BY derniere_revision ASC NULLS FIRST
        LIMIT 20
      `, [userId]),
      pool.query(`
        SELECT id, nom, derniere_revision
        FROM competences
        WHERE user_id = $1 AND statut = 1
        ORDER BY derniere_revision ASC NULLS FIRST
        LIMIT 20
      `, [userId])
    ]);

    let parcoursCoursRows = [];
    if (parcoursRes.rows.length > 0) {
      const parcoursIds = parcoursRes.rows.map(p => p.id);
      const { rows } = await pool.query(`
        SELECT pc.parcours_id, c.id, c.titre, c.statut, c.categorie, c.format, c.niveau_maitrise, pc.type, pc.position
        FROM parcours_cours pc
        JOIN cours c ON c.id = pc.cours_id
        WHERE pc.parcours_id = ANY($1::int[])
        ORDER BY pc.position ASC
      `, [parcoursIds]);
      parcoursCoursRows = rows;
    }
    const coursByParcours = new Map();
    for (const row of parcoursCoursRows) {
      const { parcours_id, ...cours } = row;
      if (!coursByParcours.has(parcours_id)) coursByParcours.set(parcours_id, []);
      coursByParcours.get(parcours_id).push(cours);
    }

    const parcoursList = parcoursRes.rows.map(p => {
      const cours = coursByParcours.get(p.id) || [];
      const obligatoires = cours.filter(c => c.type === 'Obligatoire');
      const completed = obligatoires.every(c => c.statut === 1);
      return { id: p.id, titre: p.titre, description: p.description, completed, cours };
    });

    res.json({
      cours: ratio(coursRes.rows),
      parcours: { done: parcoursList.filter(p => p.completed).length, total: parcoursList.length },
      projets: ratio(projetsRes.rows),
      competences: ratio(competencesRes.rows),
      parcoursList,
      coursARevoir: coursARevoirRes.rows,
      competencesARevoir: competencesARevoirRes.rows
    });
  } catch (err) { next(err); }
});

module.exports = router;
