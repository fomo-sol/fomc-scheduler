//module
import axios from "axios";
import * as cheerio from "cheerio";
import moment from "moment";

export async function fetchFomcMeetingDates() {
  const url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);

  const currentYear = moment().year();
  const results = [];

  // 연도별 패널을 순회
  $(".panel.panel-default").each((_, panel) => {
    const yearText = $(panel).find(".panel-heading h4 a").text();
    const matchedYear = yearText.match(/(\d{4})/);

    if (!matchedYear) return;
    const panelYear = parseInt(matchedYear[1], 10);

    if (panelYear !== currentYear) return;

    // 해당 연도의 회의들만 수집
    $(panel)
      .find(".row.fomc-meeting")
      .each((_, el) => {
        const month = $(el).find(".fomc-meeting__month strong").text().trim();
        const dateStr = $(el).find(".fomc-meeting__date").text().trim();

        if (!month || !dateStr) return;

        const [startDayStr, endDayRaw] = dateStr.split("-");
        const startDay = parseInt(startDayStr, 10);
        const endDay = endDayRaw ? parseInt(endDayRaw, 10) : startDay;

        const endDate = moment(
          `${month} ${endDay} ${panelYear}`,
          "MMMM D YYYY"
        );
        const statementDate = endDate;
        const minutesDate = endDate.clone().add(21, "days");

        results.push({
          statementDate: statementDate.format("YYYY-MM-DD"),
          minutesDate: minutesDate.format("YYYY-MM-DD"),
        });
      });
  });

  return results;
}
