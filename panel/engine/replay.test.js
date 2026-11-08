import assert from "node:assert/strict";
import test from "node:test";
import { replay } from "./replay.js";
import { rsi, signals, indicators } from "./strategy.js";

const fee = 0.001;
const roi = { 0: 0.04, 30: 0.02, 60: 0.01 };
const startup = 5;

function flat(count, price, start = 0) {
  const candles = [];
  for (let i = 0; i < count; i += 1) {
    candles.push({
      t: start + i * 300_000,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 10,
    });
  }
  return candles;
}

function run(candles, signalAt, extra = {}) {
  const signals = candles.map(() => ({ enterLong: false, exitLong: false }));
  for (const [index, patch] of Object.entries(signalAt)) signals[Number(index)] = { ...signals[Number(index)], ...patch };
  return replay({
    series: [{ pair: "BTC/USDT", candles, signals }],
    fee,
    stake: 30,
    wallet: 1000,
    stop: -0.1,
    roi,
    startup,
    maxOpen: extra.maxOpen ?? 3,
  });
}

test("entra en la vela siguiente y cierra por ROI", () => {
  const candles = flat(8, 100);
  candles[7] = { t: candles[7].t, open: 100, high: 110, low: 99, close: 105, volume: 10 };
  const result = run(candles, { 6: { enterLong: true } });
  assert.equal(result.closed.length, 1);
  assert.equal(result.closed[0].reason, "roi");
  assert.ok(Math.abs(result.closed[0].profitRatio - 0.04) < 1e-9);
  assert.equal(result.openTrades.length, 0);
});

test("el stop se llena en el precio de stop y no por debajo de la vela", () => {
  const candles = flat(8, 100);
  candles[7] = { t: candles[7].t, open: 100, high: 101, low: 80, close: 90, volume: 10 };
  const result = run(candles, { 6: { enterLong: true } });
  assert.equal(result.closed[0].reason, "stop");
  assert.equal(result.closed[0].exit, 90);
});

test("un hueco por debajo del stop sale en la apertura", () => {
  const candles = flat(9, 100);
  candles[8] = { t: candles[8].t, open: 85, high: 88, low: 80, close: 86, volume: 10 };
  const result = run(candles, { 6: { enterLong: true } });
  assert.equal(result.closed[0].reason, "stop");
  assert.equal(result.closed[0].exit, 85);
  assert.equal(result.closed[0].entry, 100);
});

test("la señal de salida usa la vela anterior y entra por la apertura", () => {
  const candles = flat(9, 100);
  candles[7] = { t: candles[7].t, open: 100, high: 101, low: 99, close: 100.2, volume: 10 };
  candles[8] = { t: candles[8].t, open: 102, high: 103, low: 101, close: 102.4, volume: 10 };
  const result = run(candles, { 6: { enterLong: true }, 7: { exitLong: true } });
  assert.equal(result.closed[0].reason, "señal");
  assert.equal(result.closed[0].exit, 102);
});

test("no abre más posiciones que el máximo", () => {
  const candles = flat(8, 100);
  const signals = candles.map(() => ({ enterLong: false, exitLong: false }));
  signals[6] = { enterLong: true, exitLong: false };
  const series = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT"].map((pair) => ({
    pair,
    candles,
    signals,
  }));
  const result = replay({
    series,
    fee,
    stake: 30,
    wallet: 1000,
    stop: -0.1,
    roi,
    startup,
    maxOpen: 3,
  });
  assert.equal(result.openTrades.length, 3);
});

test("RSI sube cuando el cierre solo asciende", () => {
  const values = Array.from({ length: 40 }, (_, i) => 100 + i);
  const valuesRsi = rsi(values, 14);
  assert.ok(valuesRsi.at(-1) > 90);
});

test("SampleStrategy no marca entrada sin cruce de RSI", () => {
  const candles = Array.from({ length: 80 }, (_, i) => {
    const close = 100 + Math.sin(i / 4);
    return { t: i * 300_000, open: close, high: close + 0.2, low: close - 0.2, close, volume: 5 };
  });
  const ind = indicators(candles);
  const rows = signals(candles, ind);
  assert.equal(rows.some((row) => row.enterLong && ind.rsi[rows.indexOf(row)] <= 30), false);
});
