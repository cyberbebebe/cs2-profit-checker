export function generateSignature(name, floatVal, pattern) {
  const p = pattern !== undefined && pattern !== null ? pattern : -1;
  const f =
    floatVal !== undefined ? parseFloat(floatVal).toFixed(8) : "0.00000000";
  return `${name}|${f}|${p}`;
}

export function formatDate(dateObj) {
  if (!dateObj) return "-";
  const d = new Date(dateObj);
  return d.toISOString().replace("T", " ").substring(0, 16);
}

export function log(msg) {
  console.log(`[CS2 Profit] ${msg}`);
  const el = document.getElementById("fetch-logs");
  if (el) {
    el.innerText = `> ${msg}`;
  }
}

//  Auto-fit Columns (Tight)
export function fitColumns(data) {
  if (!data || data.length === 0) return [];

  const keys = Object.keys(data[0]);
  // Start smaller (length + 1)
  const wscols = keys.map((k) => ({ wch: k.length + 1 }));

  const limit = Math.min(data.length, 500);
  for (let i = 0; i < limit; i++) {
    const row = data[i];
    keys.forEach((key, idx) => {
      const val = row[key];
      let len = 0;
      if (val === null || val === undefined) len = 0;
      else if (typeof val === "number") {
        len = val.toString().length;
      } else if (typeof val === "string") {
        if (val.includes("-") && val.includes(":")) len = 16;
        else len = Math.min(val.length, 40);
      }

      const headerLen = keys[idx].length;
      const contentLen = len;

      let finalLen = Math.max(headerLen, contentLen);

      if (finalLen > wscols[idx].wch) {
        wscols[idx].wch = finalLen + 1; // +1 padding
      }
    });
  }

  // Hard cap max width
  return wscols.map((c) => ({ wch: Math.min(c.wch, 50) }));
}

// JSON Download
export function downloadJSON(obj, filename) {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(obj, null, 2));
  const a = document.createElement("a");
  a.href = dataStr;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
