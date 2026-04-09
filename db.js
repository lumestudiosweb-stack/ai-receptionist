const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'receptionist.db');

let db;

async function getDb() {
  if (!db) {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    initTables();
  }
  return db;
}

function save() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

// Auto-save every 5 seconds
setInterval(save, 5000);

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid TEXT UNIQUE NOT NULL,
      caller_number TEXT NOT NULL,
      status TEXT DEFAULT 'ringing',
      started_at DATETIME DEFAULT (datetime('now')),
      ended_at DATETIME,
      duration_seconds INTEGER,
      summary TEXT,
      caller_intent TEXT,
      sentiment TEXT DEFAULT 'neutral'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (call_sid) REFERENCES calls(call_sid)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid TEXT NOT NULL,
      action_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (call_sid) REFERENCES calls(call_sid)
    )
  `);
  save();
}

// Helper to run a query and return all rows as objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper to get a single row
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

// Helper to run a statement (INSERT/UPDATE)
function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// --- Call operations ---

function createCall(callSid, callerNumber) {
  run(
    "INSERT INTO calls (call_sid, caller_number, status) VALUES (?, ?, 'in-progress')",
    [callSid, callerNumber]
  );
}

function updateCallStatus(callSid, status) {
  run('UPDATE calls SET status = ? WHERE call_sid = ?', [status, callSid]);
}

function endCall(callSid, summary, callerIntent, sentiment) {
  run(
    `UPDATE calls
     SET status = 'completed',
         ended_at = datetime('now'),
         duration_seconds = CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER),
         summary = ?,
         caller_intent = ?,
         sentiment = ?
     WHERE call_sid = ?`,
    [summary, callerIntent, sentiment, callSid]
  );
}

function getRecentCalls(limit = 50) {
  return all('SELECT * FROM calls ORDER BY started_at DESC LIMIT ?', [limit]);
}

function getCallBySid(callSid) {
  return get('SELECT * FROM calls WHERE call_sid = ?', [callSid]);
}

function getCallStats() {
  return get(`
    SELECT
      COUNT(*) as total_calls,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as active_calls,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
      AVG(duration_seconds) as avg_duration,
      SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as positive_calls,
      SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative_calls,
      SUM(CASE WHEN sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_calls
    FROM calls
    WHERE started_at >= datetime('now', '-24 hours')
  `);
}

// --- Message operations ---

function addMessage(callSid, role, content) {
  run(
    'INSERT INTO messages (call_sid, role, content) VALUES (?, ?, ?)',
    [callSid, role, content]
  );
}

function getMessages(callSid) {
  return all(
    'SELECT * FROM messages WHERE call_sid = ? ORDER BY created_at ASC',
    [callSid]
  );
}

// --- Action operations ---

function addAction(callSid, actionType, details) {
  run(
    'INSERT INTO actions (call_sid, action_type, details) VALUES (?, ?, ?)',
    [callSid, actionType, details]
  );
}

function getActions(callSid) {
  return all(
    'SELECT * FROM actions WHERE call_sid = ? ORDER BY created_at ASC',
    [callSid]
  );
}

module.exports = {
  getDb,
  createCall,
  updateCallStatus,
  endCall,
  getRecentCalls,
  getCallBySid,
  getCallStats,
  addMessage,
  getMessages,
  addAction,
  getActions,
};
