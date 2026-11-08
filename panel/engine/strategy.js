// Indicadores y señales de SampleStrategy (freqtrade/templates/sample_strategy.py).
// RSI y TEMA siguen el arranque por SMA de TA-Lib. Las bandas usan la
// desviación muestral de pandas, que es la de qtpylib.bollinger_bands.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function sampleStd(values, period) {
  const out = new Array(values.length).fill(null);
  if (period < 2) return out;
  for (let i = period - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let j = 0; j < period; j += 1) sum += values[i - j];
    const mean = sum / period;
    let acc = 0;
    for (let j = 0; j < period; j += 1) {
      const delta = values[i - j] - mean;
      acc += delta * delta;
    }
    out[i] = Math.sqrt(acc / (period - 1));
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i];
  out[period - 1] = sum / period;
  const weight = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    out[i] = values[i] * weight + out[i - 1] * (1 - weight);
  }
  return out;
}

function compactEma(source, period) {
  const compact = [];
  const index = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] != null) {
      compact.push(source[i]);
      index.push(i);
    }
  }
  const next = ema(compact, period);
  const full = new Array(source.length).fill(null);
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] != null) full[index[i]] = next[i];
  }
  return full;
}

export function tema(values, period) {
  const ema1 = ema(values, period);
  const ema2 = compactEma(ema1, period);
  const ema3 = compactEma(ema2, period);
  return values.map((_, i) => {
    if (ema1[i] == null || ema2[i] == null || ema3[i] == null) return null;
    return 3 * ema1[i] - 3 * ema2[i] + ema3[i];
  });
}

export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const up = delta > 0 ? delta : 0;
    const down = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function indicators(candles) {
  const closes = candles.map((candle) => candle.close);
  const typical = candles.map((candle) => (candle.high + candle.low + candle.close) / 3);
  const mid = sma(typical, 20);
  const deviation = sampleStd(typical, 20);
  return {
    rsi: rsi(closes, 14),
    tema: tema(closes, 9),
    bbMid: mid,
    bbUpper: mid.map((value, i) => (value == null || deviation[i] == null ? null : value + 2 * deviation[i])),
    bbLower: mid.map((value, i) => (value == null || deviation[i] == null ? null : value - 2 * deviation[i])),
  };
}

function crossedAbove(series, level, index) {
  if (index <= 0) return false;
  const current = series[index];
  const previous = series[index - 1];
  return current != null && previous != null && previous <= level && current > level;
}

export function signals(candles, ind, params = {}) {
  const buyRsi = params.buyRsi ?? 30;
  const sellRsi = params.sellRsi ?? 70;
  return candles.map((candle, i) => {
    const ready =
      ind.rsi[i] != null &&
      ind.tema[i] != null &&
      ind.tema[i - 1] != null &&
      ind.bbMid[i] != null &&
      candle.volume > 0;
    if (!ready) return { enterLong: false, exitLong: false };
    const enterLong =
      crossedAbove(ind.rsi, buyRsi, i) &&
      ind.tema[i] <= ind.bbMid[i] &&
      ind.tema[i] > ind.tema[i - 1];
    const exitLong =
      crossedAbove(ind.rsi, sellRsi, i) &&
      ind.tema[i] > ind.bbMid[i] &&
      ind.tema[i] < ind.tema[i - 1];
    return { enterLong, exitLong };
  });
}
