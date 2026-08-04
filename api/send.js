export const config = { maxDuration: 30 };

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

// Emails can't share the app's stylesheet, so everything is inline. Table
// layout rather than flexbox because Outlook and several mobile clients still
// don't handle modern CSS reliably.
function renderItinerary({ itinerary, city, brideName, dateText }) {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const tips = Array.isArray(itinerary?.tips) ? itinerary.tips : [];

  const dayBlocks = days.map((day) => {
    const blocks = Array.isArray(day.timeBlocks) ? day.timeBlocks : [];
    if (!blocks.length) return "";

    const rows = blocks.map((b) => `
      <tr>
        <td style="padding:0 12px 18px 0;vertical-align:top;white-space:nowrap;">
          <span style="font-size:13px;font-weight:600;color:#9399A6;">${esc(b.time)}</span>
        </td>
        <td style="padding:0 0 18px 0;vertical-align:top;">
          <div style="font-size:15px;font-weight:700;color:#0D0D0D;line-height:1.35;">
            ${b.emoji ? esc(b.emoji) + " " : ""}${esc(b.activity)}
          </div>
          ${b.venue ? `<div style="font-size:14px;font-weight:600;color:#7C3AED;margin-top:2px;">${esc(b.venue)}</div>` : ""}
          ${b.notes ? `<div style="font-size:14px;color:#5B6070;margin-top:4px;line-height:1.55;">${esc(b.notes)}</div>` : ""}
        </td>
      </tr>`).join("");

    return `
      <tr><td style="padding:26px 0 14px 0;">
        <span style="display:inline-block;background:#0D0D0D;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:7px 14px;border-radius:100px;">
          ${esc(day.dayLabel)}
        </span>
      </td></tr>
      <tr><td>
        <table cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
      </td></tr>`;
  }).join("");

  // Tips are the host's own prep, not guest-facing — deliberately omitted here.
  const tipsBlock = "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAFA;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAFAFA;padding:28px 12px;">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;padding:34px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

        <tr><td style="padding-bottom:6px;">
          <span style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FF3CAC;">You're invited</span>
        </td></tr>

        <tr><td style="padding-bottom:6px;">
          <h1 style="margin:0;font-size:30px;line-height:1.15;font-weight:800;color:#0D0D0D;letter-spacing:-0.02em;">
            ${esc(itinerary?.title || `${brideName ? brideName + "'s" : "The"} ${city} Weekend`)}
          </h1>
        </td></tr>

        ${dateText ? `<tr><td style="padding-bottom:22px;">
          <span style="font-size:15px;color:#9399A6;">${esc(dateText)}</span>
        </td></tr>` : `<tr><td style="padding-bottom:22px;"></td></tr>`}

        <tr><td style="border-top:1px solid #F0F0F5;"></td></tr>

        ${dayBlocks}
        ${tipsBlock}

        <tr><td style="padding-top:26px;border-top:1px solid #F0F0F5;">
          <span style="font-size:13px;color:#C3C7D1;">Planned with Lorette · lorette.ai</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Same content as plain text, for clients that won't render HTML.
function renderPlainText({ itinerary, city, brideName, dateText }) {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const lines = [
    itinerary?.title || `${brideName ? brideName + "'s" : "The"} ${city} Weekend`,
    dateText || "",
    "",
  ];
  for (const day of days) {
    const blocks = Array.isArray(day.timeBlocks) ? day.timeBlocks : [];
    if (!blocks.length) continue;
    lines.push(String(day.dayLabel || "").toUpperCase(), "");
    for (const b of blocks) {
      lines.push(`${b.time || ""}  ${b.activity || ""}`.trim());
      if (b.venue) lines.push(`   ${b.venue}`);
      if (b.notes) lines.push(`   ${b.notes}`);
      lines.push("");
    }
  }
  lines.push("—", "Planned with Lorette · lorette.ai");
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: { message: "Server is missing RESEND_API_KEY" } });
  }

  const { recipients, subject, itinerary, city, brideName, dateText, intro } = req.body || {};

  const list = Array.isArray(recipients)
    ? recipients.map((r) => String(r).trim()).filter(Boolean)
    : [];
  if (!list.length) {
    return res.status(400).json({ error: { message: "No guest emails to send to." } });
  }
  const bad = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (bad.length) {
    return res.status(400).json({ error: { message: `These don't look like email addresses: ${bad.join(", ")}` } });
  }
  if (list.length > 50) {
    return res.status(400).json({ error: { message: "That's more than 50 guests — send in smaller batches." } });
  }
  if (!itinerary?.days?.length) {
    return res.status(400).json({ error: { message: "There's no plan to send yet." } });
  }

  const payload = { itinerary, city, brideName, dateText, intro };
  const html = renderItinerary(payload);
  const text = renderPlainText(payload);
  const from = process.env.RESEND_FROM || "Lorette <hello@lorette.ai>";
  const finalSubject = subject || `${brideName ? brideName + "'s" : "The"} ${city} weekend — the plan`;

  try {
    // One request per guest so nobody sees anyone else's address.
    const results = await Promise.allSettled(
      list.map((to) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({ from, to, subject: finalSubject, html, text }),
        }).then(async (r) => {
          if (!r.ok) {
            const detail = await r.json().catch(() => ({}));
            throw new Error(detail?.message || `Resend returned ${r.status}`);
          }
          return r.json();
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results
      .map((r, i) => (r.status === "rejected" ? { to: list[i], reason: r.reason?.message } : null))
      .filter(Boolean);

    if (sent === 0) {
      return res.status(502).json({
        error: { message: failed[0]?.reason || "None of the invites went out." },
      });
    }
    return res.status(200).json({ sent, total: list.length, failed });
  } catch (error) {
    return res.status(502).json({ error: { message: `Couldn't reach the mail service: ${error.message}` } });
  }
}
