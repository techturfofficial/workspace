const router = require('express').Router();
const db = require('../db');
const { verifyToken, checkRole } = require('../auth');
const { performance } = require('perf_hooks');

// Helper to check valid table name against existing SQLite tables
function getValidTableNames() {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC").all();
  return rows.map(r => r.name);
}

// 1. List all tables with stats
router.get('/tables', verifyToken, checkRole('admin'), (req, res) => {
  try {
    const validTables = getValidTableNames();
    const tables = validTables.map(name => {
      let count = 0;
      let cols = [];
      try {
        const countRow = db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get();
        count = countRow ? countRow.count : 0;
        cols = db.prepare(`PRAGMA table_info("${name}")`).all();
      } catch (_) {}
      return {
        name,
        count,
        columnCount: cols.length,
        columns: cols.map(c => ({
          cid: c.cid,
          name: c.name,
          type: c.type,
          notnull: c.notnull,
          dflt_value: c.dflt_value,
          pk: c.pk
        }))
      };
    });
    res.json(tables);
  } catch (e) {
    console.error('Error fetching tables:', e);
    res.status(500).json({ error: 'Failed to list tables', details: e.message });
  }
});

// 2. Get paginated table rows with searching and sorting
router.get('/table/:name', verifyToken, checkRole('admin'), (req, res) => {
  const { name } = req.params;
  const validTables = getValidTableNames();
  
  if (!validTables.includes(name)) {
    return res.status(404).json({ error: `Table '${name}' not found` });
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const sortBy = (req.query.sortBy || '').trim();
  const sortDir = (req.query.sortDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  try {
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
    const columnNames = columns.map(c => c.name);

    let whereClause = '';
    const params = [];

    // If search term provided, build search conditions across all text/varchar/integer columns
    if (search) {
      const searchConditions = columnNames.map(col => `CAST("${col}" AS TEXT) LIKE ?`);
      whereClause = `WHERE ${searchConditions.join(' OR ')}`;
      columnNames.forEach(() => params.push(`%${search}%`));
    }

    // Total count for current search
    const totalRow = db.prepare(`SELECT COUNT(*) as total FROM "${name}" ${whereClause}`).get(...params);
    const total = totalRow ? totalRow.total : 0;

    // Sorting
    let orderClause = '';
    if (sortBy && columnNames.includes(sortBy)) {
      orderClause = `ORDER BY "${sortBy}" ${sortDir}`;
    } else {
      // Default sort by primary key or first column
      const pkCol = columns.find(c => c.pk === 1);
      if (pkCol) {
        orderClause = `ORDER BY "${pkCol.name}" DESC`;
      } else if (columnNames.length > 0) {
        orderClause = `ORDER BY "${columnNames[0]}" DESC`;
      }
    }

    // Query rows
    const queryParams = [...params, limit, offset];
    const rows = db.prepare(`SELECT * FROM "${name}" ${whereClause} ${orderClause} LIMIT ? OFFSET ?`).all(...queryParams);

    // Mask passwords for security if users table
    if (name === 'users') {
      rows.forEach(r => {
        if (r.password) r.password = '••••••••••••';
      });
    }

    res.json({
      tableName: name,
      columns,
      rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (e) {
    console.error('Error fetching table data:', e);
    res.status(500).json({ error: `Failed to load table ${name}`, details: e.message });
  }
});

// 3. Get table schema, indexes, and foreign keys
router.get('/schema/:name', verifyToken, checkRole('admin'), (req, res) => {
  const { name } = req.params;
  const validTables = getValidTableNames();

  if (!validTables.includes(name)) {
    return res.status(404).json({ error: `Table '${name}' not found` });
  }

  try {
    const tableMaster = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${name}")`).all();
    const indexes = db.prepare(`PRAGMA index_list("${name}")`).all();

    res.json({
      name,
      sql: tableMaster ? tableMaster.sql : '',
      columns,
      foreignKeys,
      indexes
    });
  } catch (e) {
    console.error('Error fetching schema:', e);
    res.status(500).json({ error: 'Failed to inspect schema', details: e.message });
  }
});

// 4. SQL Query Console (Admin Power Tool)
router.post('/query', verifyToken, checkRole('admin'), (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    return res.status(400).json({ error: 'SQL query string is required' });
  }

  const trimmed = sql.trim();
  const startTime = performance.now();

  try {
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(trimmed);
    
    if (isSelect) {
      const rows = db.prepare(trimmed).all();
      const executionTimeMs = (performance.now() - startTime).toFixed(2);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      res.json({
        type: 'select',
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs
      });
    } else {
      const info = db.prepare(trimmed).run();
      const executionTimeMs = (performance.now() - startTime).toFixed(2);

      res.json({
        type: 'mutation',
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        executionTimeMs
      });
    }
  } catch (e) {
    const executionTimeMs = (performance.now() - startTime).toFixed(2);
    res.status(400).json({
      error: 'SQL Execution Error',
      message: e.message,
      executionTimeMs
    });
  }
});

module.exports = router;
