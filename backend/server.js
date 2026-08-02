const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ==================== SQLITE DATABASE ====================
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Chapters table
  db.run(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      durationMin INTEGER DEFAULT 10,
      questions TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Results table
  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapterName TEXT NOT NULL,
      studentName TEXT DEFAULT 'Anonymous',
      correct INTEGER DEFAULT 0,
      wrong INTEGER DEFAULT 0,
      unattempted INTEGER DEFAULT 0,
      score REAL DEFAULT 0,
      total INTEGER DEFAULT 0,
      negativeMarks REAL DEFAULT 0,
      answers TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admins table
  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default admin if not exists
  db.get(`SELECT * FROM admins WHERE username = 'admin1000'`, (err, row) => {
    if (!row) {
      db.run(`INSERT INTO admins (username, password) VALUES (?, ?)`, ['gsssb', 'test1234']);
      console.log('✅ Default admin created');
    }
  });

  console.log('✅ SQLite database initialized');
});

// ==================== HELPER FUNCTIONS ====================
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// ==================== ROUTES ====================

// ---------- Chapters ----------
// Get all chapters
app.get('/api/chapters', async (req, res) => {
  try {
    const chapters = await allQuery(`SELECT * FROM chapters ORDER BY createdAt DESC`);
    // Parse questions JSON
    const parsedChapters = chapters.map(ch => ({
      ...ch,
      questions: JSON.parse(ch.questions)
    }));
    res.json(parsedChapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single chapter
app.get('/api/chapters/:id', async (req, res) => {
  try {
    const chapter = await getQuery(`SELECT * FROM chapters WHERE id = ?`, [req.params.id]);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
    chapter.questions = JSON.parse(chapter.questions);
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create chapter
app.post('/api/chapters', async (req, res) => {
  try {
    const { name, durationMin, questions } = req.body;
    const questionsJSON = JSON.stringify(questions || []);
    const result = await runQuery(
      `INSERT INTO chapters (name, durationMin, questions) VALUES (?, ?, ?)`,
      [name, durationMin || 10, questionsJSON]
    );
    const newChapter = await getQuery(`SELECT * FROM chapters WHERE id = ?`, [result.id]);
    newChapter.questions = JSON.parse(newChapter.questions);
    res.status(201).json(newChapter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update chapter
app.put('/api/chapters/:id', async (req, res) => {
  try {
    const { name, durationMin, questions } = req.body;
    const questionsJSON = JSON.stringify(questions || []);
    await runQuery(
      `UPDATE chapters SET name = ?, durationMin = ?, questions = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, durationMin || 10, questionsJSON, req.params.id]
    );
    const updated = await getQuery(`SELECT * FROM chapters WHERE id = ?`, [req.params.id]);
    if (!updated) return res.status(404).json({ error: 'Chapter not found' });
    updated.questions = JSON.parse(updated.questions);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete chapter
app.delete('/api/chapters/:id', async (req, res) => {
  try {
    const result = await runQuery(`DELETE FROM chapters WHERE id = ?`, [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Chapter not found' });
    res.json({ message: 'Chapter deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Results ----------
// Save result
app.post('/api/results', async (req, res) => {
  try {
    const { chapterName, studentName, correct, wrong, unattempted, score, total, negativeMarks, answers } = req.body;
    const answersJSON = JSON.stringify(answers || {});
    const result = await runQuery(
      `INSERT INTO results (chapterName, studentName, correct, wrong, unattempted, score, total, negativeMarks, answers) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [chapterName, studentName || 'Anonymous', correct || 0, wrong || 0, unattempted || 0, score || 0, total || 0, negativeMarks || 0, answersJSON]
    );
    const newResult = await getQuery(`SELECT * FROM results WHERE id = ?`, [result.id]);
    res.status(201).json(newResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all results
app.get('/api/results', async (req, res) => {
  try {
    const results = await allQuery(`SELECT * FROM results ORDER BY date DESC LIMIT 100`);
    // Parse answers JSON
    const parsedResults = results.map(r => ({
      ...r,
      answers: r.answers ? JSON.parse(r.answers) : {}
    }));
    res.json(parsedResults);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get results by chapter
app.get('/api/results/chapter/:chapterName', async (req, res) => {
  try {
    const results = await allQuery(
      `SELECT * FROM results WHERE chapterName = ? ORDER BY date DESC LIMIT 50`,
      [req.params.chapterName]
    );
    const parsedResults = results.map(r => ({
      ...r,
      answers: r.answers ? JSON.parse(r.answers) : {}
    }));
    res.json(parsedResults);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Admin ----------
// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await getQuery(
      `SELECT * FROM admins WHERE username = ? AND password = ?`,
      [username, password]
    );
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ 
      success: true, 
      username: admin.username,
      message: 'Login successful' 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Statistics ----------
app.get('/api/stats', async (req, res) => {
  try {
    const totalChapters = await getQuery(`SELECT COUNT(*) as count FROM chapters`);
    const totalQuestions = await getQuery(`SELECT SUM(json_array_length(questions)) as total FROM chapters`);
    const totalResults = await getQuery(`SELECT COUNT(*) as count FROM results`);
    const avgScore = await getQuery(`SELECT AVG(score) as avg FROM results`);

    res.json({
      totalChapters: totalChapters.count || 0,
      totalQuestions: totalQuestions.total || 0,
      totalResults: totalResults.count || 0,
      avgScore: (avgScore.avg || 0).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API URL: http://localhost:${PORT}/api/chapters`);
  console.log(`💾 Database: ${dbPath}`);
});
