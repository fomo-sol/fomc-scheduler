import pool from "../../config/stockdb.js";

/**
 * DB에 존재하는 S&P500 종목만 필터링
 * @param {Array<{ symbol: string, date: string, hour: string }>} earnings
 * @returns {Promise<Array<{ symbol: string, date: string, hour: string }>>}
 */
export async function filterSp500Stocks(earnings) {
  if (!earnings || earnings.length === 0) return [];

  const uniqueSymbols = [...new Set(earnings.map((e) => e.symbol))];
  const placeholders = uniqueSymbols.map(() => "?").join(",");

  console.log(uniqueSymbols, placeholders);
  const query = `
    SELECT stock_symbol FROM stocks
    WHERE stock_symbol IN (${placeholders})
  `;

  try {
    const rows = await pool.query(query, uniqueSymbols);
    console.log("S&P500 종목 조회:", rows);

    const sp500Symbols = new Set(rows.map((r) => r.stock_symbol));

    const filtered = earnings.filter((e) => sp500Symbols.has(e.symbol));
    console.log(`✅ S&P500 종목 ${filtered.length}건 필터링 완료`);

    return filtered;
  } catch (err) {
    console.error("❌ S&P500 필터링 에러:", err);
    return [];
  }
}

/**
 * stock_finance 테이블에 실적 발표 일정 저장
 * @param {Array<{ symbol: string, date: string, hour: string }>} earnings
 */
export async function saveEarningsToDb(earnings) {
  if (!earnings || earnings.length === 0) return;

  // symbol 리스트 추출
  const symbols = [...new Set(earnings.map((e) => e.symbol))];
  const placeholders = symbols.map(() => "?").join(",");

  // stocks 테이블에서 symbol에 해당하는 id 조회
  const symbolQuery = `
    SELECT id, stock_symbol FROM stocks
    WHERE stock_symbol IN (${placeholders})
  `;

  try {
    const rows = await pool.query(symbolQuery, symbols);

    // symbol → id 매핑
    const symbolToId = new Map();
    for (const row of rows) {
      symbolToId.set(row.stock_symbol, row.id);
    }

    // INSERT용 values 구성
    const insertValues = [];
    for (const e of earnings) {
      const stockId = symbolToId.get(e.symbol);
      if (!stockId) continue;

      insertValues.push([stockId, e.date, e.hour]);
    }

    if (insertValues.length === 0) {
      console.warn("⚠️ 저장할 실적 데이터가 없습니다.");
      return;
    }

    const insertQuery = `
  INSERT IGNORE INTO stock_finances (stock_id, fin_release_date, fin_hour)
  VALUES ${insertValues.map(() => "(?, ?, ?)").join(",")}
`;

    const flattenedValues = insertValues.flat();

    await pool.query(insertQuery, flattenedValues);

    console.log(`✅ stock_finance에 ${insertValues.length}건 저장 완료`);
  } catch (err) {
    console.error("❌ saveEarningsToDb 에러:", err);
  }
}

export async function getTodayEarnings() {
  const query = `select stock_id, fin_release_date, fin_hour from stock_finances where fin_release_date = CURDATE() and fin_period_date is not null`;
  //   const query = `select stock_id, fin_release_date, fin_hour from stock_finances where fin_release_date = CURDATE() - INTERVAL 1 DAY and fin_period_date is not null`;
  try {
    const rows = await pool.query(query);
    if (rows.length === 0) {
      console.log("오늘 실적 일정이 없습니다.");
      return [];
    }
    // console.log("오늘 실적 일정 조회 성공:", rows);
    return rows;
  } catch (err) {
    console.error("오늘 실적 일정 조회 실패:", err.message);
    return [];
  }
}
