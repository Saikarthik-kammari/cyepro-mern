require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  await mongoose.connection.collection('rules').updateMany({}, { $set: { isActive: true } });
  console.log('All rules enabled!');
  mongoose.disconnect();
});