require('dotenv').config();  
const mongoose = require('mongoose');  
const Rule = require('./models/Rule');  
mongoose.connect(process.env.MONGO_URI).then(async () => {  
const rules = await Rule.find({ isActive: true, isDeleted: false }).sort({ priority: -1 });  
console.log(JSON.stringify(rules, null, 2));  
mongoose.disconnect();  
}); 
