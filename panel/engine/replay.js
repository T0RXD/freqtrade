// Recorrido en seco al estilo del backtesting de freqtrade:
// la señal de una vela cerrada se ejecuta en la apertura de la siguiente.
// Prioridad de salida: señal, stop, ROI.

function requiredRoi(roiTable, minutes) {
  let chosen = null;
  let rate = null;
  for (const [key, value] of Object.entries(roiTable)) {
    const minute = Number(key);
    if (minute <= minutes && (chosen == null || minute > chosen)) {
      chosen = minute;
      rate = value;
    }
  }
  return { minute: chosen, rate };
}

function roiPrice(entry, fee, rate) {
  return (entry * (1 + fee) * (1 + rate)) / (1 - fee);
}

function closePosition(trade, price, time, reason, fee) {
  const proceeds = trade.amount * price * (1 - fee);
  return {
    id: trade.id,
    pair: trade.pair,
    openTime: trade.openTime,
    closeTime: time,
    entry: trade.entry,
    exit: price,
    stake: trade.stake,
    amount: trade.amount,
    profitAbs: proceeds - trade.entryCost,
    profitRatio: proceeds / trade.entryCost - 1,
    reason,
    cashDelta: proceeds,
  };
}

function tryExit(trade, bar, signal, fee, stop, roiTable) {
  const minutes = Math.floor((bar.t - trade.openTime) / 60000);
  if (signal?.exitLong && !signal?.enterLong) {
    return closePosition(trade, bar.open, bar.t, "señal", fee);
  }

  const stopPrice = trade.entry * (1 + stop);
  if (bar.open <= stopPrice) {
    return closePosition(trade, bar.open, bar.t, "stop", fee);
  }
  if (bar.low <= stopPrice) {
    return closePosition(trade, stopPrice, bar.t, "stop", fee);
  }

  const roi = requiredRoi(roiTable, minutes);
  if (roi.rate == null) return null;
  const target = roiPrice(trade.entry, fee, roi.rate);
  if (bar.high <= target) return null;
  if (bar.open >= target) return closePosition(trade, bar.open, bar.t, "roi", fee);
  return closePosition(trade, target, bar.t, "roi", fee);
}

export function replay({ series, fee, stake, wallet, stop, roi, startup, maxOpen }) {
  const books = series.map((item) => ({
    pair: item.pair,
    bars: item.candles,
    signals: item.signals,
  }));
  const times = [...new Set(books.flatMap((book) => book.bars.map((bar) => bar.t)))].sort(
    (a, b) => a - b,
  );
  const open = new Map();
  const closed = [];
  const equity = [];
  let cash = wallet;
  let nextId = 1;

  for (const time of times) {
    const rows = [];
    for (const book of books) {
      const index = book.bars.findIndex((bar) => bar.t === time);
      if (index >= 0) rows.push({ book, index, bar: book.bars[index] });
    }

    for (const row of rows) {
      const trade = open.get(row.book.pair);
      if (!trade || trade.openTime === time) continue;
      const previous = row.index > 0 ? row.book.signals[row.index - 1] : null;
      const exited = tryExit(trade, row.bar, previous, fee, stop, roi);
      if (!exited) continue;
      cash += exited.cashDelta;
      open.delete(row.book.pair);
      closed.push(exited);
    }

    for (const row of rows) {
      if (open.has(row.book.pair)) continue;
      if (row.index - 1 < startup) continue;
      const previous = row.book.signals[row.index - 1];
      if (!previous?.enterLong) continue;
      if (open.size >= maxOpen) continue;
      const entryCost = stake * (1 + fee);
      if (cash < entryCost || !(row.bar.open > 0)) continue;
      cash -= entryCost;
      open.set(row.book.pair, {
        id: nextId,
        pair: row.book.pair,
        openTime: time,
        entry: row.bar.open,
        stake,
        amount: stake / row.bar.open,
        entryCost,
      });
      nextId += 1;
    }

    for (const row of rows) {
      const trade = open.get(row.book.pair);
      if (!trade || trade.openTime !== time) continue;
      const exited = tryExit(trade, row.bar, null, fee, stop, roi);
      if (!exited) continue;
      cash += exited.cashDelta;
      open.delete(row.book.pair);
      closed.push(exited);
    }

    let marked = cash;
    for (const trade of open.values()) {
      const row = rows.find((item) => item.book.pair === trade.pair);
      const price = row ? row.bar.close : trade.entry;
      marked += trade.amount * price * (1 - fee);
    }
    equity.push({ t: time, equity: marked });
  }

  const openTrades = [...open.values()].map((trade) => {
    const book = books.find((item) => item.pair === trade.pair);
    const last = book.bars[book.bars.length - 1];
    const proceeds = trade.amount * last.close * (1 - fee);
    return {
      id: trade.id,
      pair: trade.pair,
      openTime: trade.openTime,
      entry: trade.entry,
      price: last.close,
      stake: trade.stake,
      profitAbs: proceeds - trade.entryCost,
      profitRatio: proceeds / trade.entryCost - 1,
      minutes: Math.floor((last.t - trade.openTime) / 60000),
      stop: trade.entry * (1 + stop),
    };
  });

  return { cash, closed, openTrades, equity };
}
