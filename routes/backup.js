const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { CATEGORIES, FORMATS } = require('../constants');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 Mo, largement suffisant pour ce format
});

const SHEETS = ['Cours', 'Competences', 'Cours_Competences', 'Parcours', 'Parcours_Cours', 'Projets'];

// ===================== EXPORT =====================
// GET /api/export
router.get('/export', async (req, res, next) => {
  try {
    const [coursRes, compRes, coursCompRes, parcoursRes, parcoursCoursRes, projetsRes] = await Promise.all([
      pool.query('SELECT id, titre, description, statut, categorie, format, niveau_maitrise FROM cours ORDER BY id'),
      pool.query('SELECT id, nom, description, statut, niveau_maitrise FROM competences ORDER BY id'),
      pool.query(`
        SELECT c.titre AS cours_titre, k.nom AS competence_nom
        FROM cours_competences cc
        JOIN cours c ON c.id = cc.cours_id
        JOIN competences k ON k.id = cc.competence_id
        ORDER BY c.titre, k.nom
      `),
      pool.query('SELECT id, titre, description FROM parcours ORDER BY id'),
      pool.query(`
        SELECT p.titre AS parcours_titre, c.titre AS cours_titre, pc.type, pc.position
        FROM parcours_cours pc
        JOIN parcours p ON p.id = pc.parcours_id
        JOIN cours c ON c.id = pc.cours_id
        ORDER BY p.titre, pc.position
      `),
      pool.query('SELECT id, titre, description, statut FROM projets ORDER BY id')
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
      { header: 'niveau_maitrise', key: 'niveau_maitrise', width: 16 }
    ], coursRes.rows);

    addSheet('Competences', [
      { header: 'id', key: 'id', width: 8 },
      { header: 'nom', key: 'nom', width: 28 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'statut', key: 'statut', width: 9 },
      { header: 'niveau_maitrise', key: 'niveau_maitrise', width: 16 }
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

    const filename = `zenskills-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// ===================== IMPORT =====================
function sheetToObjects(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return null;
  const headerRow = sheet.getRow(1).values; // tableau 1-indexé, [0] est vide
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

// POST /api/import  (champ multipart "file")
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // CASCADE supprime aussi le contenu de cours_competences et parcours_cours,
    // qui référencent ces tables. RESTART IDENTITY repart de 1 pour les id.
    await client.query('TRUNCATE TABLE cours, competences, parcours, projets RESTART IDENTITY CASCADE');

    const coursIdByTitre = new Map();
    for (const r of sheets.Cours) {
      const titre = String(r.titre || '').trim();
      if (!titre) continue;
      const statut = truthy(r.statut) ? 1 : 0;
      const categorie = CATEGORIES.includes(r.categorie) ? r.categorie : CATEGORIES[0];
      const format = FORMATS.includes(r.format) ? r.format : FORMATS[0];
      const niveau = validNiveau(statut, r.niveau_maitrise);
      const insertRes = await client.query(
        'INSERT INTO cours (titre, description, statut, categorie, format, niveau_maitrise) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [titre, r.description || '', statut, categorie, format, niveau]
      );
      coursIdByTitre.set(titre, insertRes.rows[0].id);
    }

    const compIdByNom = new Map();
    for (const r of sheets.Competences) {
      const nom = String(r.nom || '').trim();
      if (!nom) continue;
      const statut = truthy(r.statut) ? 1 : 0;
      const niveau = validNiveau(statut, r.niveau_maitrise);
      const insertRes = await client.query(
        'INSERT INTO competences (nom, description, statut, niveau_maitrise) VALUES ($1,$2,$3,$4) RETURNING id',
        [nom, r.description || '', statut, niveau]
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
        'INSERT INTO parcours (titre, description) VALUES ($1,$2) RETURNING id',
        [titre, r.description || '']
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

    let projetsCount = 0;
    for (const r of sheets.Projets) {
      const titre = String(r.titre || '').trim();
      if (!titre) continue;
      await client.query(
        'INSERT INTO projets (titre, description, statut) VALUES ($1,$2,$3)',
        [titre, r.description || '', truthy(r.statut) ? 1 : 0]
      );
      projetsCount++;
    }

    await client.query('COMMIT');

    res.json({
      cours: coursIdByTitre.size,
      competences: compIdByNom.size,
      parcours: parcoursIdByTitre.size,
      projets: projetsCount,
      liensCoursCompetencesIgnores,
      liensParcoursCoursIgnores
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
