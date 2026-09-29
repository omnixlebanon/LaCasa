// Keep historical business records, but stop all chatbot workflow entry points.
module.exports = (req, res, next) => {
 if (/^\/api\/(bot(?:\/|$)|management\/requests(?:\/|$)|history\/[^/]+\/refund-request(?:\/|$))/.test(req.path)) {
  return res.status(410).json({ code: 'CHATBOT_DISABLED', error: 'Telegram chatbot features are disabled. This request was not applied.' });
 }
 next();
};
