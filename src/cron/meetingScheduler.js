import { getPendingMeetings, updateMeetingStatus } from "../db/meetingDates.js";
import { startPollingForDoc } from "../jobs/pollFomc.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import axios from "axios";
import pool from "../../config/db.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// S3 저장이 끝난 후 호출
async function notifyAlarmServers(date, type) {
  const urls = [
    // "http://15.165.199.80:4000/api/notifications/notify",
    "http://localhost:4000/api/notifications/notify",
  ];
  for (const url of urls) {
    try {
      await axios.post(url, { date, type });
      console.log(`${url} 알림 서버에 성공적으로 요청을 보냈습니다.`);
    } catch (err) {
      console.error(`${url} 알림 서버 요청 실패:`, err);
    }
  }
}

// type별 시간 정보 조회 함수
async function getFomcEventTime(type, date) {
  const conn = await pool.getConnection();
  try {
    let query, timeField;
    if (type === "statement") {
      query =
        "SELECT fed_start_time FROM pdafomo.fomc_rate_decisions WHERE fed_release_date = ?";
      timeField = "fed_start_time";
    } else if (type === "minutes") {
      query =
        "SELECT fomc_start_time FROM pdafomo.fomc_minutes WHERE fomc_release_date = ?";
      timeField = "fomc_start_time";
    } else {
      return null;
    }
    const rows = await conn.query(query, [date]);
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (row && row[timeField]) {
      // 한국 시간으로 변환
      return dayjs
        .tz(row[timeField], "Asia/Seoul")
        .format("YYYY-MM-DD HH:mm:ss");
    }
    return null;
  } finally {
    conn.release();
  }
}

// 알림 서버로 전송
async function notifyFomcPreAlarm(date, type, state) {
  const time = await getFomcEventTime(type, date);
  const urls = [
    // "http://15.165.199.80:4000/api/notifications/prealarm",
    "http://localhost:4000/api/notifications/prealarm",
  ];
  for (const url of urls) {
    try {
      await axios.post(url, { date, type, state, time });
      console.log(`${url} FOMC 미리 알림 요청 성공`);
    } catch (err) {
      if (err.response) {
        // 서버가 응답한 경우
        console.error(
          `${url} FOMC 미리 알림 요청 실패: [${err.response.status}] ${err.response.statusText}`
        );
      } else if (err.request) {
        // 요청은 갔으나 응답이 없는 경우
        console.error(
          `${url} FOMC 미리 알림 요청 실패: No response from server`
        );
      } else {
        // 기타 에러
        console.error(`${url} FOMC 미리 알림 요청 실패:`, err.message);
      }
    }
  }
}

// 업로드 알림 전송 함수
async function notifyFomcUploadAlarm(date, type) {
  const time = await getFomcEventTime(type, date);
  const urls = [
    // "http://15.165.199.80:4000/api/notifications/uploaded",
    "http://localhost:4000/api/notifications/uploaded",
  ];
  for (const url of urls) {
    try {
      await axios.post(url, { date, type, time });
      console.log(`${url} FOMC 업로드 알림 요청 성공`);
    } catch (err) {
      if (err.response) {
        console.error(
          `${url} FOMC 업로드 알림 요청 실패: [${err.response.status}] ${err.response.statusText}`
        );
      } else if (err.request) {
        console.error(
          `${url} FOMC 업로드 알림 요청 실패: No response from server`
        );
      } else {
        console.error(`${url} FOMC 업로드 알림 요청 실패:`, err.message);
      }
    }
  }
}

export async function runMeetingScheduler() {
  const meetings = await getPendingMeetings();
  // const today = new Date().toISOString().split("T")[0];

  const mockNow = dayjs.tz("2025-06-18T14:00:00", "America/New_York");
  const today = mockNow.format("YYYY-MM-DD");
  const currentHourMinute = mockNow.format("HH:mm");

  for (const meeting of meetings) {
    const { statementDate, minutesDate, status } = meeting;
    console.log(today, statementDate, minutesDate, status, currentHourMinute);
    const statementDay = dayjs(meeting.statementDate).format("YYYY-MM-DD");
    const minutesDay = dayjs(meeting.minutesDate).format("YYYY-MM-DD");
    console.log(minutesDay, today);
    if (today === statementDay && status === "pending") {
      // 미국 시간 오후 2시에 맞춰 polling 시작
      await startPollingForDoc("statement", statementDate);
      await startPollingForDoc("implementation_note", statementDate);
      await startPollingForDoc("transcript", statementDate);
      await updateMeetingStatus(statementDate, "statement-fetched");
      await notifyAlarmServers(statementDate, "statement");
      await notifyFomcUploadAlarm(statementDate, "statement"); // 업로드 알림 추가
      return;
    }

    if (today === minutesDay && status === "statement-fetched") {
      await startPollingForDoc("minutes", statementDate);
      await updateMeetingStatus(statementDate, "done");
      await notifyFomcUploadAlarm(statementDate, "minutes"); // 업로드 알림 추가
      return;
    }
  }
}

export async function runFomcPreAlarmScheduler() {
  const meetings = await getPendingMeetings();
  // const today = dayjs().tz("Asia/Seoul").format("YYYY-MM-DD");
  const today = "2025-06-11";

  console.log(`📆 [PreAlarm 스케줄러 시작] 기준 날짜: ${today}`);
  console.log(`📊 조회된 일정 수: ${meetings.length}`);

  for (const meeting of meetings) {
    const statementDay = dayjs(meeting.statementDate).format("YYYY-MM-DD");
    const oneWeekBefore = dayjs(meeting.statementDate)
      .subtract(7, "day")
      .format("YYYY-MM-DD");
    const oneDayBefore = dayjs(meeting.statementDate)
      .subtract(1, "day")
      .format("YYYY-MM-DD");

    console.log(
      `🗓️ 금리 결정: ${statementDay}, D-7: ${oneWeekBefore}, D-1: ${oneDayBefore}`
    );

    if (today === oneWeekBefore) {
      console.log(`🚨 [${statementDay}] FOMC D-7 알림 전송`);
      console.log(
        `📦 payload → date: ${statementDay}, type: statement, state: one_week_before`
      );
      await notifyFomcPreAlarm(statementDay, "statement", "one_week_before");
    }

    if (today === oneDayBefore) {
      console.log(`🚨 [${statementDay}] FOMC D-1 알림 전송`);
      console.log(
        `📦 payload → date: ${statementDay}, type: statement, state: one_day_before`
      );
      await notifyFomcPreAlarm(statementDay, "statement", "one_day_before");
    }

    const minutesDay = dayjs(meeting.minutesDate).format("YYYY-MM-DD");
    const minutesOneWeekBefore = dayjs(meeting.minutesDate)
      .subtract(7, "day")
      .format("YYYY-MM-DD");
    const minutesOneDayBefore = dayjs(meeting.minutesDate)
      .subtract(1, "day")
      .format("YYYY-MM-DD");

    console.log(
      `🗓️ 의사록: ${minutesDay}, D-7: ${minutesOneWeekBefore}, D-1: ${minutesOneDayBefore}`
    );

    if (today === minutesOneWeekBefore) {
      console.log(`🚨 [${minutesDay}] FOMC minutes D-7 알림 전송`);
      console.log(
        `📦 payload → date: ${minutesDay}, type: minutes, state: one_week_before`
      );
      await notifyFomcPreAlarm(minutesDay, "minutes", "one_week_before");
    }
    if (today === minutesOneDayBefore) {
      console.log(`🚨 [${minutesDay}] FOMC minutes D-1 알림 전송`);
      console.log(
        `📦 payload → date: ${minutesDay}, type: minutes, state: one_day_before`
      );
      await notifyFomcPreAlarm(minutesDay, "minutes", "one_day_before");
    }
  }
}
