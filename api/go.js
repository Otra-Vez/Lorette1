// Sends a link out via lorette.ai so iOS doesn't hand it to a partner app.
//
// Tapping opentable.com directly triggers iOS universal links: if the OpenTable
// app is installed, the app opens and ignores the web URL's query string, so the
// user lands on an empty search. iOS evaluates that against the domain in the
// tapped link — so a tap on lorette.ai opens Safari, and the redirect that
// follows isn't treated as a fresh universal link.
//
// Booking.com's app does read its parameters, so its links don't come through
// here. Only ones whose app drops them need this.

// An unrestricted redirect on your own domain is a phishing tool. Allowlist only.
// Google is deliberately absent: /url is its own redirector, which would let
// this endpoint be chained to an arbitrary destination.
const ALLOWED_HOSTS = new Set([
  'opentable.com', 'www.opentable.com',
  'booking.com', 'www.booking.com',
  'airbnb.com', 'www.airbnb.com',
]);

export default function handler(req, res) {
  const raw = req.query?.u;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).send('Missing destination');
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).send('Invalid destination');
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(400).send('Destination not allowed');
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.writeHead(302, { Location: target.toString() });
  return res.end();
}
