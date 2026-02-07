exports.login = (req, res) => {
  res.json({ token: "dummy-jwt-token" });
};

exports.getResults = (req, res) => {
  res.json({ studentId: req.params.studentId, score: 85 });
};
