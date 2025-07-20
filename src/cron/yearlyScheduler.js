// src/cron/yearlyScheduler.js
const cron = require("node-cron");
const { fetchFomcMeetingDates } = require("../jobs/fetchFomcCalendar");
const { saveMeetingsToDb } = require("../db/saveMeetingsToDb");
const { scheduleMeetingJobs } = require("./meetingScheduler");

const runYearlyFomcUpdate = async () => {
  try {
    const meetings = await fetchFomcMeetingDates();

    if (meetings.length === 0) {
      console.warn(`⚠️ 회의 일정이 없습니다.`);
      return;
    }

    await saveMeetingsToDb(meetings);
    await scheduleMeetingJobs(meetings);

    console.log(`✅ ${year}년 FOMC 회의 일정 업데이트 완료`);
  } catch (err) {
    console.error("❌ yearlyScheduler 에러:", err);
  }
};

// 매년 1월 1일 00:10에 실행
cron.schedule("10 0 1 1 *", () => {
  console.log("📆 연간 FOMC 일정 수집 시작");
  runYearlyFomcUpdate();
});

module.exports = {
  runYearlyFomcUpdate,
};
