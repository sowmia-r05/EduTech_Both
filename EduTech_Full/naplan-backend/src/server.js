const app = require("./app");

const connectDB = require("./config/db");

connectDB();


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NAPLAN backend running on port ${PORT}`);
});
