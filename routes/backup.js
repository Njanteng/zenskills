const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { CATEGORIES, FORMATS } = require('../constants');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const SHEETS = ['Cours', 'Competences', 'Cours_Competences', 'Parcours', 'Parcours_Cours', 'Projets', 'Taches'];

router.get('/export', async (req, res, next) => {
  try {
    const userId = req.userId;
    const [coursRes, compRes, coursCompRes, parcoursRes, parcoursCoursRes, projetsRes, tachesRes] = await Promise.all([
      pool.query('SELECT id, titre, description, statut, categorie, format, niveau_maitrise, derniere_revision FROM cours WHERE user_id = $1 ORDER BY id', [userId]),
      pool.query('SELECT id, nom, description, statut, niveau_maitrise, derniere_revision FROM competences WHERE user_id = $1 ORDER BY id', [userId]),
      pool.query(`
        SELECT c.titre AS cours_titre, k.nom AS competence_nom
        FROM cours_competences cc
        JOIN cours c ON c.id = cc.cours_id
        JOIN competences k ON k.id = cc.competence_id
        WHERE c.user_id = $1 AND k.user_id = $1
        ORDER BY c.titre, k.nom
      `, [userId]),
      pool.query('SELECT id, titre, description FROM parcours WHERE user_id = $1 ORDER BY id', [userId]),
      pool.query(`
        SELECT p.titre AS parcours_titre, c.titre AS cours_titre, pc.type, pc.position
        FROM parcours_cours pc
        JOIN parcours p ON p.id = pc.parcours_id
        JOIN cours c ON c.id = pc.cours_id
        WHERE p.user_id = $1 AND c.user_id = $1
        ORDER BY p.titre, pc.position
      `, [userId]),
      pool.query('SELECT id, titre, description, statut FROM projets WHERE user_id = $1 ORDER BY id', [userId]),
      pool.query(`
        SELECT
          t.id, t.titre, t.description, t.statut,
          CASE WHEN t.cours_id IS NOT NULL THEN 'cours' WHEN t.parcours_id IS NOT NULL THEN 'parcours' WHEN t.projet_id IS NOT NULL THEN 'projet' ELSE '' END AS lien_type,
          COALESCE(c.titre, p.titre, pj.titre, '') AS lien_titre
        FROM taches t
        LEFT JOIN cours c ON c.id = t.cours_id
        LEFT JOIN parcours p ON p.id = t.parcours_id
        LEFT JOIN projets pj ON pj.id = t.projet_id
        WHERE t.user_id = $1
        ORDER BY t.id
      `, [userId])
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ZenSkills';
    workbook.created = new Date();

    const addSheet = (name, columns, rows) => {
      const sheet = workbook.addWorksheet(name);
      sheet.columns = columns;
      sheet.getRow(1).font = { bold: true };
      if (rows.length) sheet.addRows(rows);
    };

    addSheet('Cours', [
      { header: 'id', key: 'id', width: 8 },
      { header: 'titre', key: 'titre', width: 32 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'statut', key: 'statut', width: 9 },
      { header: 'categorie', key: 'categorie', width: 26 },
      { header: 'format', key: 'format', width: 10 },
      { header: 'niveau_maitrise', key: 'niveau_maitrise', width: 16 },
      { header: 'derniere_revision', key: 'derniere_revision', width: 16 }
    ], coursRes.rows);

    addSheet('Competences', [
      { header: 'id', key: 'id', width: 8 },
      { header: 'nom', key: 'nom', width: 28 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'statut', key: 'statut', width: 9 },
      { header: 'niveau_maitrise', key: 'niveau_maitrise', width: 16 },
      { header: 'derniere_revision', key: 'derniere_revision', width: 16 }
    ], compRes.rows);

    addSheet('Cours_Competences', [
      { header: 'cours_titre', key: 'cours_titre', width: 32 },
      { header: 'competence_nom', key: 'competence_nom', width: 28 }
    ], coursCompRes.rows);

    addSheet('Parcours', [
      { header: 'id', key: 'id', width: 8 },
      { header: 'titre', key: 'titre', width: 32 },
      { header: 'description', key: 'description', width: 40 }
    ], parcoursRes.rows);

    addSheet('Parcours_Cours', [
      { header: 'parcours_titre', key: 'parcours_titre', width: 32 },
      { header: 'cours_titre', key: 'cours_titre', width: 32 },
      { header: 'type', key: 'type', width: 14 },
      { header: 'position', key: 'position', width: 10 }
    ], parcoursCoursRes.rows);

    addSheet('Projets', [
      { header: 'id', key: 'id', width: 8 },
      { header: 'titre', key: 'titre', width: 32 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'statut', key: 'statut', width: 9 }
    ], projetsRes.rows);

    addSheet('Taches', [
      { header: 'id', key: 'id', width: 8 },
      { header: 'titre', key: 'titre', width: 32 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'statut', key: 'statut', width: 9 },
      { header: 'lien_type', key: 'lien_type', width: 12 },
      { header: 'lien_titre', key: 'lien_titre', width: 32 }
    ], tachesRes.rows);

    const filename = `zenskills-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

function sheetToObjects(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return null;
  const headerRow = sheet.getRow(1).values;
  const headers = headerRow.slice(1).map(h => String(h ?? '').trim());
  const rows = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const obj = {};
    headers.forEach((h, idx) => {
      const cell = row.getCell(idx + 1);
      obj[h] = cell.value !== null && cell.value !== undefined ? cell.value : '';
    });
    const isEmpty = Object.values(obj).every(v => v === '' || v === null || v === undefined);
    if (!isEmpty) rows.push(obj);
  }
  return rows;
}

function truthy(v) {
  return v === 1 || v === '1' || v === true || v === 'true' || v === 'TRUE';
}

function validNiveau(statut, v) {
  if (!statut) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

router.post('/import', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: 'Fichier Excel invalide ou corrompu.' });
  }

  const sheets = {};
  for (const name of SHEETS) {
    const rows = sheetToObjects(workbook, name);
    if (rows === null) {
      return res.status(400).json({ error: `Onglet manquant dans le fichier : "${name}". Utilisez un fichier exporté depuis ZenSkills.` });
    }
    sheets[name] = rows;
  }

  const userId = req.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Ne supprime QUE les données de l'utilisateur connecté — jamais celles des autres comptes.
    await client.query('DELETE FROM taches WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM cours WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM competences WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM parcours WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM projets WHERE user_id = $1', [userId]);

    const coursIdByTitre = new Map();
    for (const r of sheets.Cours) {
      const titre = String(r.titre || '').trim();
      if (!titre) continue;
      const statut = truthy(r.statut) ? 1 : 0;
      const categorie = CATEGORIES.includes(r.categorie) ? r.categorie : CATEGORIES[0];
      const format = FORMATS.includes(r.format) ? r.format : FORMATS[0];
      const niveau = validNiveau(statut, r.niveau_maitrise);
      const derniereRevision = statut ? parseDate(r.derniere_revision) : null;
      const insertRes = await client.query(
        'INSERT INTO cours (user_id, titre, description, statut, categorie, format, niveau_maitrise, derniere_revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [userId, titre, r.description || '', statut, categorie, format, niveau, derniereRevision]
      );
      coursIdByTitre.set(titre, insertRes.rows[0].id);
    }

    const compIdByNom = new Map();
    for (const r of sheets.Competences) {
      const nom = String(r.nom || '').trim();
      if (!nom) continue;
      const statut = truthy(r.statut) ? 1 : 0;
      const niveau = validNiveau(statut, r.niveau_maitrise);
      const derniereRevision = statut ? parseDate(r.derniere_revision) : null;
      const insertRes = await client.query(
        'INSERT INTO competences (user_id, nom, description, statut, niveau_maitrise, derniere_revision) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [userId, nom, r.description || '', statut, niveau, derniereRevision]
      );
      compIdByNom.set(nom, insertRes.rows[0].id);
    }

    let liensCoursCompetencesIgnores = 0;
    for (const r of sheets.Cours_Competences) {
      const coursId = coursIdByTitre.get(String(r.cours_titre || '').trim());
      const compId = compIdByNom.get(String(r.competence_nom || '').trim());
      if (!coursId || !compId) { liensCoursCompetencesIgnores++; continue; }
      await client.query(
        'INSERT INTO cours_competences (cours_id, competence_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [coursId, compId]
      );
    }

    const parcoursIdByTitre = new Map();
    for (const r of sheets.Parcours) {
      const titre = String(r.titre || '').trim();
      if (!titre) continue;
      const insertRes = await client.query(
        'INSERT INTO parcours (user_id, titre, description) VALUES ($1,$2,$3) RETURNING id',
        [userId, titre, r.description || '']
      );
      parcoursIdByTitre.set(titre, insertRes.rows[0].id);
    }

    let liensParcoursCoursIgnores = 0;
    for (const r of sheets.Parcours_Cours) {
      const parcoursId = parcoursIdByTitre.get(String(r.parcours_titre || '').trim());
      const coursId = coursIdByTitre.get(String(r.cours_titre || '').trim());
      if (!parcoursId || !coursId) { liensParcoursCoursIgnores++; continue; }
      const type = r.type === 'Optionnel' ? 'Optionnel' : 'Obligatoire';
      const position = Number.isInteger(Number(r.position)) ? Number(r.position) : 0;
      await client.query(
        'INSERT INTO parcours_cours (parcours_id, cours_id, type, position) VALUES ($1,$2,$3,$4)',
        [parcoursId, coursId, type, position]
      );
    }

    const projetIdByTitre = new Map();
    let projetsCount = 0;
    for (const r of sheets.Projets) {
      const titre = String(r.titre || '').trim();
      if (!titre) continue;
      const insertRes = await client.query(
        'INSERT INTO projets (user_id, titre, description, statut) VALUES ($1,$2,$3,$4) RETURNING id',
        [userId, titre, r.description || '', truthy(r.statut) ? 1 : 0]
      );
      projetIdByTitre.set(titre, insertRes.rows[0].id);
      projetsCount++;
    }

    let tachesCount = 0;
    let liensTachesIgnores = 0;
    for (const r of sheets.Taches) {
      const titre = String(r.titre || '').trim();
      if (!titre) continue;
      const lienType = String(r.lien_type || '').trim().toLowerCase();
      const lienTitre = String(r.lien_titre || '').trim();
      let coursId = null, parcoursId = null, projetId = null;
      if (lienType && lienTitre) {
        if (lienType === 'cours') coursId = coursIdByTitre.get(lienTitre) || null;
        else if (lienType === 'parcours') parcoursId = parcoursIdByTitre.get(lienTitre) || null;
        else if (lienType === 'projet') projetId = projetIdByTitre.get(lienTitre) || null;
        if (!coursId && !parcoursId && !projetId) liensTachesIgnores++;
      }
      await client.query(
        'INSERT INTO taches (user_id, titre, description, statut, cours_id, parcours_id, projet_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [userId, titre, r.description || '', truthy(r.statut) ? 1 : 0, coursId, parcoursId, projetId]
      );
      tachesCount++;
    }

    await client.query('COMMIT');

    res.json({
      cours: coursIdByTitre.size,
      competences: compIdByNom.size,
      parcours: parcoursIdByTitre.size,
      projets: projetsCount,
      taches: tachesCount,
      liensCoursCompetencesIgnores,
      liensParcoursCoursIgnores,
      liensTachesIgnores
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
