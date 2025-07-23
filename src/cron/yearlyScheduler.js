// src/cron/yearlyScheduler.js
import cron from "node-cron";
import { fetchFomcMeetingDates } from "../jobs/fetchFomcCalendar.js";
import { saveMeetingsToDb } from "../db/meetingDates.js";
import { runMeetingScheduler } from "./meetingScheduler.js";
import "./dailyMeetingScheduler.js";

export const runYearlyFomcUpdate = async () => {
  try {
    const meetings = await fetchFomcMeetingDates();

    if (meetings.length === 0) {
      console.warn(`⚠️ 회의 일정이 없습니다.`);
      return;
    }

    await saveMeetingsToDb(meetings);
    // await runMeetingScheduler();

    console.log(`✅ 2025년 FOMC 회의 일정 업데이트 완료`);
  } catch (err) {
    console.error("❌ yearlyScheduler 에러:", err);
  }
};

// 매년 1월 1일 00:10에 실행
cron.schedule("10 0 1 1 *", () => {
  console.log("📆 연간 FOMC 일정 수집 시작");
  runYearlyFomcUpdate();
});

(async () => {
  console.log("📆 최초 실행 일단 오늘 ㄱㄱ");
  await runYearlyFomcUpdate();
})();
