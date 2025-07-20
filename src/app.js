// const { initYearlySchedule } = require("./cron/yearlyScheduler.js/index.js");
// const { scheduleNextMeeting } = require("./cron/meetingScheduler.js");

// (async () => {
//   await initYearlySchedule(); // 매년 1월 1일 일정 수집 스케줄
//   await scheduleNextMeeting(); // 다음 회의부터 재귀 시작
// })();

// src/app.js
const { fetchFomcMeetingDates } = require("./jobs/fetchFomcCalendar");

(async () => {
  const results = await fetchFomcMeetingDates();
  console.log("📅 FOMC 일정 크롤링 결과:");
  console.table(results);
})();
