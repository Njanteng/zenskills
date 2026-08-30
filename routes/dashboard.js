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
    const [coursRes, competencesRes, projetsRes, parcoursRes, aRevoirRes] = await Promise.all([
      pool.query('SELECT * FROM cours WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM competences WHERE user_id = $1 ORDER BY LOWER(nom)', [userId]),
      pool.query('SELECT * FROM projets WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM parcours WHERE user_id = $1 ORDER BY LOWER(titre)', [userId]),
      pool.query(`
        SELECT id, titre AS nom, 'cours' AS type, derniere_revision
        FROM cours
        WHERE user_id = $1 AND statut = 1
          AND (derniere_revision IS NULL OR derniere_revision < CURRENT_DATE - INTERVAL '6 months')
        UNION ALL
        SELECT id, nom, 'competence' AS type, derniere_revision
        FROM competences
        WHERE user_id = $1 AND statut = 1
          AND (derniere_revision IS NULL OR derniere_revision < CURRENT_DATE - INTERVAL '6 months')
        ORDER BY derniere_revision ASC NULLS FIRST
      `, [userId])
    ]);

    const parcoursList = await Promise.all(parcoursRes.rows.map(async p => {
      const { rows: cours } = await pool.query(`
        SELECT c.id, c.titre, c.statut, c.categorie, c.format, c.niveau_maitrise, pc.type, pc.position
        FROM parcours_cours pc
        JOIN cours c ON c.id = pc.cours_id
        WHERE pc.parcours_id = $1
        ORDER BY pc.position ASC
      `, [p.id]);
      const obligatoires = cours.filter(c => c.type === 'Obligatoire');
      const completed = obligatoires.every(c => c.statut === 1);
      return { id: p.id, titre: p.titre, description: p.description, completed, cours };
    }));

    const competencesAcquises = competencesRes.rows
      .filter(k => k.statut === 1)
      .map(k => ({ id: k.id, nom: k.nom, niveau_maitrise: k.niveau_maitrise }));

    res.json({
      cours: ratio(coursRes.rows),
      parcours: { done: parcoursList.filter(p => p.completed).length, total: parcoursList.length },
      projets: ratio(projetsRes.rows),
      competences: ratio(competencesRes.rows),
      competencesAcquises,
      parcoursList,
      aRevoir: aRevoirRes.rows
    });
  } catch (err) { next(err); }
});

module.exports = router;
