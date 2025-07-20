const {
  getPendingMeetings,
  updateMeetingStatus,
} = require("../db/meetingModel");
const { startPollingForDoc } = require("../jobs/pollFomc");

async function runMeetingScheduler() {
  const meetings = await getPendingMeetings();
  const today = new Date().toISOString().split("T")[0];

  for (const meeting of meetings) {
    const { statementDate, minutesDate, status } = meeting;

    if (today === statementDate && status === "pending") {
      // 미국 시간 오후 2시에 맞춰 polling 시작
      await startPollingForDoc("statement", statementDate);
      await startPollingForDoc("implementation_note", statementDate);
      await startPollingForDoc("transcript", statementDate);
      await updateMeetingStatus(statementDate, "statement-fetched");
      return;
    }

    if (today === minutesDate && status === "statement-fetched") {
      await startPollingForDoc("minutes", minutesDate);
      await updateMeetingStatus(statementDate, "done");
      return;
    }
  }
}

module.exports = {
  runMeetingScheduler,
};
