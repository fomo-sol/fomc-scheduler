import { getPendingMeetings, updateMeetingStatus } from "../db/meetingDates.js";
import { startPollingForDoc } from "../jobs/pollFomc.js";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function runMeetingScheduler() {
  const meetings = await getPendingMeetings();
  const today = new Date().toISOString().split("T")[0];

  //   const mockNow = dayjs.tz("2025-06-18T14:00:00", "America/New_York");
  //   const today = mockNow.format("YYYY-MM-DD");
  //   const currentHourMinute = mockNow.format("HH:mm");

  for (const meeting of meetings) {
    const { statementDate, minutesDate, status } = meeting;
    // console.log(today, statementDate, minutesDate, status, currentHourMinute);
    const statementDay = dayjs(meeting.statementDate).format("YYYY-MM-DD");
    const minutesDay = dayjs(meeting.minutesDate).format("YYYY-MM-DD");
    // console.log(statementDay, today);
    if (today === statementDay && status === "pending") {
      // 미국 시간 오후 2시에 맞춰 polling 시작
      await startPollingForDoc("statement", statementDate);
      await startPollingForDoc("implementation_note", statementDate);
      await startPollingForDoc("transcript", statementDate);
      await updateMeetingStatus(statementDate, "statement-fetched");
      return;
    }

    if (today === minutesDay && status === "statement-fetched") {
      await startPollingForDoc("minutes", minutesDate);
      await updateMeetingStatus(statementDate, "done");
      return;
    }
  }
}
