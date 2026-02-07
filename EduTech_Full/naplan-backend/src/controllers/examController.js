exports.getAllExams = (req, res) => {
  res.json({ message: "List of NAPLAN mock exams" });
};

exports.getExamDetails = (req, res) => {
  res.json({ examId: req.params.examId });
};

exports.startExam = (req, res) => {
  res.json({ status: "Exam started" });
};

exports.submitExam = (req, res) => {
  res.json({ status: "Exam submitted" });
};
