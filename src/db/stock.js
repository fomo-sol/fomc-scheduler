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

// 오늘 실적
export async function getTodayEarnings() {
  // const query = `select stock_id, fin_release_date, fin_hour from stock_finances where fin_release_date = CURDATE() and fin_period_date is not null`;
  const query = `select stock_id, fin_release_date, fin_hour from stock_finances where fin_release_date = CURDATE() - INTERVAL 1 DAY and fin_period_date is not null`;

  // 어제를 나타냄, 한국 24일 09시라면, db에서 23일꺼 갖고옴


  try {
    const rows = await pool.query(query);
    if (rows.length === 0) {
      console.log("오늘 실적 일정이 없습니다.");
      return [];
    }
    return rows;
  } catch (err) {
    console.error("오늘 실적 일정 조회 실패:", err.message);
    return [];
  }
}


// 하루 전(D-1) 알림용: 내일 발표 예정 종목을 오늘 조회
export async function getEarningsForPreAlarm() {
  const query = `
    SELECT sf.stock_id, sf.fin_release_date, sf.fin_hour, s.stock_symbol AS symbol
    FROM stock_finances sf
    JOIN stocks s ON sf.stock_id = s.id
    WHERE sf.fin_release_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND sf.fin_period_date IS NOT NULL
  `;
  const rows = await pool.query(query);
  if (!rows || rows.length === 0) {
    console.log("📭 하루 전 알림 대상 실적 일정이 없습니다.");
    return [];
  }
  console.log("📅 하루 전 알림 대상 실적 일정:", rows);
  return rows;
}

export async function getSymbolByStockId(stock_id) {
  const query = "SELECT stock_symbol FROM stocks WHERE id = ?";
  const rows = await pool.query(query, [stock_id]);
  console.log('rows:', rows);
  const row = rows[0];
  return row ? row.stock_symbol : null;

export async function getStockId(symbol) {
  const query = `select id from stocks where stock_symbol = ?`;
  try {
    const [row] = await pool.query(query, [symbol]);
    if (!row) {
      console.log(`종목 ${symbol}에 해당하는 ID를 찾을 수 없습니다.`);
      return null;
    }
    return row.id;
  } catch (err) {
    console.error("getStockId 에러:", err);
    return null;
  }
}

export async function updateStockFinances(
  stockId,
  date,
  epsActual,
  revenueActual
) {
  const query = `
  UPDATE stock_finances
  SET fin_eps_value = ?, fin_revenue_value = ?
  WHERE stock_id = ? AND fin_release_date = CAST(? AS DATE)
`;

  try {
    const result = await pool.query(query, [
      epsActual,
      revenueActual,
      stockId,
      date,
    ]);
    if (result.affectedRows > 0) {
      console.log(`✅ stock_finances 업데이트 성공: ${stockId}, ${date}`);
      return true;
    }
    console.log(`⚠️ stock_finances 업데이트 실패: 해당 데이터가 없습니다.`);
    return false;
  } catch (err) {
    console.error("updateStockFinances 에러:", err);
    return false;
  }

}
