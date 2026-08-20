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
    const [coursRes, competencesRes, projetsRes, parcoursRes] = await Promise.all([
      pool.query('SELECT * FROM cours'),
      pool.query('SELECT * FROM competences ORDER BY LOWER(nom)'),
      pool.query('SELECT * FROM projets'),
      pool.query('SELECT * FROM parcours ORDER BY LOWER(titre)')
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
      parcoursList
    });
  } catch (err) { next(err); }
});

module.exports = router;
