module.exports = function(req, res) {
  res.json({
    ok: true,
    node: process.version,
    hasUrl: !!process.env.SUPABASE_URL,
    hasKey: !!process.env.SUPABASE_SERVICE_KEY,
    method: req.method,
  });
};
