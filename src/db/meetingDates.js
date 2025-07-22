// db/meetingDates.js
// const pool = require("../config/db.js");
import pool from "../../config/db.js"; // ES Module 버전

// 📌 저장 함수
export async function saveMeetingsToDb(meetings) {
  const conn = await pool.getConnection();
  try {
    for (const meeting of meetings) {
      const { statementDate, minutesDate } = meeting;

      await conn.query(
        `INSERT IGNORE INTO MeetingDates (statementDate, minutesDate, status)
         VALUES (?, ?, 'pending')`,
        [statementDate, minutesDate]
      );
    }
  } finally {
    conn.release();
  }
}

// 📌 pending 상태인 회의들 조회
export async function getPendingMeetings() {
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(
      `SELECT * FROM MeetingDates`
      // WHERE status = 'pending'
    );
    return rows;
  } finally {
    conn.release();
  }
}

// 📌 상태 갱신
export async function updateMeetingStatus(statementDate, status) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `UPDATE MeetingDates SET status = ?, updated_at = NOW() WHERE statementDate = ?`,
      [status, statementDate]
    );
  } finally {
    conn.release();
  }
}

// commonjs 모듈로 export
