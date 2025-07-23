// const { initYearlySchedule } = require("./cron/yearlyScheduler.js/index.js");
// const { scheduleNextMeeting } = require("./cron/meetingScheduler.js");

// (async () => {
//   await initYearlySchedule(); // 매년 1월 1일 일정 수집 스케줄
//   await scheduleNextMeeting(); // 다음 회의부터 재귀 시작
// })();

// src/app.js

// import "./cron/yearlyScheduler.js"; //fomc 스케줄러 실행
import "./cron/earningsScheduler.js"; // 실적 발표 일정 스케줄러 실행

// import { runMeetingScheduler } from "./cron/meetingScheduler.js";
// runMeetingScheduler(); // FOMC 문서 확인 스케줄러 실행
