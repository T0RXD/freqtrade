import { indicators, signals } from "./strategy.js";
import { replay } from "./replay.js";

export const CONFIG = {
  bot: "freqtrade",
  strategy: "SampleStrategy",
  mode: "dry_run",
  exchange: "Binance",
  market: "spot",
  timeframe: "5m",
  stake: 30,
  maxOpenTrades: 3,
  wallet: 1000,
  stakeCurrency: "USDT",
  fee: 0.001,
  stoploss: -0.1,
  minimalRoi: { 0: 0.04, 30: 0.02, 60: 0.01 },
  startup: 200,
  buyRsi: 30,
  sellRsi: 70,
};

const PAIRS = [
  ["BTCUSDT", "BTC/USDT"],
  ["ETHUSDT", "ETH/USDT"],
  ["SOLUSDT", "SOL/USDT"],
  ["XRPUSDT", "XRP/USDT"],
  ["LINKUSDT", "LINK/USDT"],
];

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const TTL_MS = 45_000;

let cache = { at: 0, data: null, pending: null };

async function fetchCandles(symbol) {
  let lastError = new Error("sin velas");
  for (const host of HOSTS) {
    try {
      const url = `${host}/api/v3/klines?symbol=${symbol}&interval=5m&limit=1000`;
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`mercado ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length < CONFIG.startup + 2) {
        throw new Error("histórico corto");
      }
      rows.pop();
      return rows.map((row) => ({
        t: row[0],
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function changePct(candles) {
  const lookback = Math.min(288, candles.length - 1);
  const then = candles[candles.length - 1 - lookback].close;
  const now = candles[candles.length - 1].close;
  return then === 0 ? 0 : (now - then) / then;
}

function buildDesk(loaded) {
  const series = loaded.map((item) => {
    const ind = indicators(item.candles);
    return { ...item, ind, signals: signals(item.candles, ind, CONFIG) };
  });
  const result = replay({
    series,
    fee: CONFIG.fee,
    stake: CONFIG.stake,
    wallet: CONFIG.wallet,
    stop: CONFIG.stoploss,
    roi: CONFIG.minimalRoi,
    startup: CONFIG.startup,
    maxOpen: CONFIG.maxOpenTrades,
  });

  const closed = result.closed;
  const wins = closed.filter((trade) => trade.profitAbs > 0).length;
  const profitAbs = result.equity.at(-1).equity - CONFIG.wallet;
  const asOf = Math.max(...series.map((item) => item.candles.at(-1).t));

  return {
    bot: {
      ...CONFIG,
      state: "running",
      asOf,
      generatedAt: Date.now(),
      source: "Velas públicas de Binance. Dry-run: no hay claves ni órdenes.",
    },
    wallet: {
      start: CONFIG.wallet,
      cash: result.cash,
      equity: result.equity.at(-1).equity,
      profitAbs,
      profitRatio: profitAbs / CONFIG.wallet,
    },
    stats: {
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      open: result.openTrades.length,
    },
    pairs: series.map((item) => {
      const last = item.candles.length - 1;
      const markers = [
        ...closed
          .filter((trade) => trade.pair === item.pair)
          .flatMap((trade) => [
            { t: trade.openTime, kind: "entry", price: trade.entry },
            { t: trade.closeTime, kind: "exit", price: trade.exit, reason: trade.reason },
          ]),
        ...result.openTrades
          .filter((trade) => trade.pair === item.pair)
          .map((trade) => ({ t: trade.openTime, kind: "entry", price: trade.entry })),
      ];
      return {
        pair: item.pair,
        price: item.candles[last].close,
        changePct: changePct(item.candles),
        rsi: item.ind.rsi[last],
        tema: item.ind.tema[last],
        bbMid: item.ind.bbMid[last],
        candles: item.candles.map((candle) => ({ t: candle.t, c: candle.close })),
        markers,
      };
    }),
    openTrades: result.openTrades,
    closedTrades: closed.slice(-40).reverse(),
    equity: result.equity.filter((_, index) => index % 3 === 0 || index === result.equity.length - 1),
  };
}

export async function getDesk() {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL_MS) return cache.data;
  if (!cache.pending) {
    cache.pending = Promise.all(
      PAIRS.map(async ([symbol, pair]) => ({ pair, candles: await fetchCandles(symbol) })),
    )
      .then((loaded) => {
        const data = buildDesk(loaded);
        cache = { at: Date.now(), data, pending: null };
        return data;
      })
      .catch((error) => {
        cache.pending = null;
        throw error;
      });
  }
  return cache.pending;
}

export function resetDeskCache() {
  cache = { at: 0, data: null, pending: null };
}
