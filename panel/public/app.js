const state = { desk: null, pair: "BTC/USDT" };

const money = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat("es-ES", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const clock = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const banner = document.querySelector("#banner");
const refreshButton = document.querySelector("#refresh");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatPrice(value) {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6;
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function signed(value, formatter) {
  const text = formatter(value);
  return value > 0 ? `+${text}` : text;
}

function duration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return `${hours} h ${rest} min`;
}

function tone(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function renderConfig(bot) {
  const rows = [
    ["Estado", "corriendo"],
    ["Modo", "dry-run"],
    ["Exchange", bot.exchange],
    ["Stake", `${money.format(bot.stake)} ${bot.stakeCurrency}`],
    ["Máx. abiertas", String(bot.maxOpenTrades)],
    ["Stop", percent.format(bot.stoploss)],
    ["ROI 0 / 30 / 60", "4% / 2% / 1%"],
    ["RSI compra / venta", `${bot.buyRsi} / ${bot.sellRsi}`],
  ];
  const list = document.querySelector("#config");
  list.replaceChildren();
  for (const [label, value] of rows) {
    list.append(el("dt", "", label), el("dd", "", value));
  }
}

function renderMetrics(desk) {
  const items = [
    ["Capital", `${money.format(desk.wallet.equity)} USDT`, tone(desk.wallet.profitAbs)],
    ["Resultado", signed(desk.wallet.profitAbs, (value) => `${money.format(value)} USDT`), tone(desk.wallet.profitAbs)],
    ["Rendimiento", signed(desk.wallet.profitRatio, (value) => percent.format(value)), tone(desk.wallet.profitRatio)],
    ["Cierres", `${desk.stats.wins} a favor · ${desk.stats.losses} en contra`, ""],
  ];
  const root = document.querySelector("#metrics");
  root.replaceChildren();
  for (const [label, value, className] of items) {
    const card = el("article", "metric");
    card.append(el("span", "", label), el("strong", className, value));
    root.append(card);
  }
}

function renderPairs(desk) {
  const root = document.querySelector("#pairs");
  root.replaceChildren();
  for (const pair of desk.pairs) {
    const button = el("button", `pair${pair.pair === state.pair ? " selected" : ""}`);
    button.type = "button";
    button.append(el("strong", "", pair.pair));
    button.append(el("span", "sub", `RSI ${pair.rsi == null ? "—" : pair.rsi.toFixed(1)}`));
    button.append(el("span", "px", formatPrice(pair.price)));
    button.append(el("span", `chg ${tone(pair.changePct)}`, signed(pair.changePct, (value) => percent.format(value))));
    button.addEventListener("click", () => {
      state.pair = pair.pair;
      renderPairs(desk);
      renderChart(desk);
    });
    root.append(button);
  }
}

function resize(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function drawPrice(desk) {
  const canvas = document.querySelector("#price");
  const { context, width, height } = resize(canvas);
  const pair = desk.pairs.find((item) => item.pair === state.pair) ?? desk.pairs[0];
  const candles = pair.candles;
  context.clearRect(0, 0, width, height);
  const pad = { l: 88, r: 16, t: 16, b: 28 };
  const closes = candles.map((candle) => candle.c);
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  const span = max - min || 1;
  min -= span * 0.06;
  max += span * 0.06;
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const xAt = (index) => pad.l + (candles.length <= 1 ? plotW / 2 : (index / (candles.length - 1)) * plotW);
  const yAt = (price) => pad.t + ((max - price) / (max - min)) * plotH;

  context.strokeStyle = "#2c3428";
  context.lineWidth = 1;
  context.font = "11px IBM Plex Mono, ui-monospace, monospace";
  context.fillStyle = "#8f987f";
  for (let step = 0; step < 4; step += 1) {
    const price = min + ((max - min) * step) / 3;
    const y = yAt(price);
    context.beginPath();
    context.moveTo(pad.l, y);
    context.lineTo(width - pad.r, y);
    context.stroke();
    context.fillText(formatPrice(price), 8, y + 4);
  }

  context.beginPath();
  candles.forEach((candle, index) => {
    const x = xAt(index);
    const y = yAt(candle.c);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "#d5dcc8";
  context.lineWidth = 1.4;
  context.stroke();

  for (const marker of pair.markers) {
    const index = candles.findIndex((candle) => candle.t === marker.t);
    if (index < 0) continue;
    const x = xAt(index);
    const y = yAt(marker.price);
    context.fillStyle = marker.kind === "entry" ? "#e0c27a" : "#d7d3c4";
    context.beginPath();
    if (marker.kind === "entry") {
      context.moveTo(x, y + 10);
      context.lineTo(x - 4, y + 16);
      context.lineTo(x + 4, y + 16);
    } else {
      context.moveTo(x, y - 10);
      context.lineTo(x - 4, y - 16);
      context.lineTo(x + 4, y - 16);
    }
    context.fill();
  }

  context.fillStyle = "#8f987f";
  context.fillText(clock.format(candles[0].t), pad.l, height - 8);
  context.fillText(clock.format(candles.at(-1).t), width - 120, height - 8);
  document.querySelector("#chart-title").textContent = pair.pair;
  document.querySelector("#chart-note").textContent = "Triángulo de latón: entrada. Triángulo claro: salida.";
}

function drawEquity(desk) {
  const canvas = document.querySelector("#equity");
  const { context, width, height } = resize(canvas);
  const points = desk.equity;
  context.clearRect(0, 0, width, height);
  const pad = { l: 88, r: 16, t: 12, b: 8 };
  let min = Math.min(...points.map((point) => point.equity), desk.wallet.start);
  let max = Math.max(...points.map((point) => point.equity), desk.wallet.start);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const xAt = (index) => pad.l + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - pad.l - pad.r));
  const yAt = (value) => pad.t + ((max - value) / (max - min)) * (height - pad.t - pad.b);
  const base = yAt(desk.wallet.start);
  context.strokeStyle = "#3a3324";
  context.setLineDash([3, 4]);
  context.beginPath();
  context.moveTo(pad.l, base);
  context.lineTo(width - pad.r, base);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  points.forEach((point, index) => {
    const x = xAt(index);
    const y = yAt(point.equity);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = "#e0c27a";
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = "#8f987f";
  context.font = "11px IBM Plex Mono, ui-monospace, monospace";
  context.fillText(money.format(max), 8, 16);
  context.fillText(money.format(min), 8, height - 8);
}

function tradeTable(columns, rows, emptyText) {
  if (rows.length === 0) return el("p", "empty", emptyText);
  const table = el("table");
  const head = el("tr");
  for (const column of columns) head.append(el("th", "", column.label));
  const thead = el("thead");
  thead.append(head);
  const tbody = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    for (const column of columns) {
      const cell = el("td", column.className?.(row) ?? "", column.value(row));
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}

function renderTrades(desk) {
  document.querySelector("#open-count").textContent = `${desk.stats.open} de ${desk.bot.maxOpenTrades}`;
  document.querySelector("#closed-count").textContent = `${desk.stats.closed} en la ventana de velas`;
  const openColumns = [
    { label: "Par", value: (trade) => trade.pair },
    { label: "Entrada", value: (trade) => formatPrice(trade.entry) },
    { label: "Precio", value: (trade) => formatPrice(trade.price) },
    {
      label: "Resultado",
      value: (trade) => signed(trade.profitAbs, (value) => money.format(value)),
      className: (trade) => tone(trade.profitAbs),
    },
    { label: "Tiempo", value: (trade) => duration(trade.minutes * 60000) },
    { label: "Stop", value: (trade) => formatPrice(trade.stop) },
  ];
  const closedColumns = [
    { label: "Par", value: (trade) => trade.pair },
    { label: "Entrada", value: (trade) => formatPrice(trade.entry) },
    { label: "Salida", value: (trade) => formatPrice(trade.exit) },
    {
      label: "Resultado",
      value: (trade) => signed(trade.profitAbs, (value) => money.format(value)),
      className: (trade) => tone(trade.profitAbs),
    },
    { label: "Motivo", value: (trade) => trade.reason },
    { label: "Duración", value: (trade) => duration(trade.closeTime - trade.openTime) },
  ];
  document.querySelector("#open-trades").replaceChildren(
    tradeTable(openColumns, desk.openTrades, "Ninguna posición abierta en este tramo."),
  );
  document.querySelector("#closed-trades").replaceChildren(
    tradeTable(closedColumns, desk.closedTrades, "Todavía no hay cierres en las últimas velas."),
  );
}

function renderChart(desk) {
  drawPrice(desk);
  drawEquity(desk);
}

function render(desk) {
  state.desk = desk;
  if (!desk.pairs.some((pair) => pair.pair === state.pair)) state.pair = desk.pairs[0].pair;
  document.querySelector("#asof").textContent = `Vela ${clock.format(desk.bot.asOf)} UTC`;
  document.querySelector("#asof").dateTime = new Date(desk.bot.asOf).toISOString();
  renderConfig(desk.bot);
  renderMetrics(desk);
  renderPairs(desk);
  renderTrades(desk);
  renderChart(desk);
  banner.hidden = true;
}

async function load() {
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/desk", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo leer el bot.");
    render(payload);
  } catch (error) {
    banner.hidden = false;
    banner.textContent = error instanceof Error ? error.message : "No se pudo leer el bot.";
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => {
  load();
});
window.addEventListener("resize", () => {
  if (state.desk) renderChart(state.desk);
});
load();
setInterval(load, 60_000);
