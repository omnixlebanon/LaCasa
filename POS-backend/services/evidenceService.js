function sendEvidence(res, data) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(data || '');
  if (!match) return res.status(404).json({ error: 'Evidence image is unavailable.' });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 4 * 1024 * 1024) return res.status(413).json({ error: 'This image exceeds the hosting response limit.' });
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.type(match[1]).send(buffer);
}
module.exports = { sendEvidence };
