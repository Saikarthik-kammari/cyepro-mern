require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Rule = require('../models/Rule');
const FatigueSettings = require('../models/FatigueSettings');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await User.deleteMany({});
  await Rule.deleteMany({});
  await FatigueSettings.deleteMany({});

  // Create users
  const bcrypt = require('bcryptjs');

// Inside the seed function, replace User.create with this:
const adminHash = await bcrypt.hash('Admin@123', 10);
const operatorHash = await bcrypt.hash('Operator@123', 10);

await User.create([
  { 
    name: 'Admin User', 
    email: 'admin@cyepro.com', 
    password: adminHash, 
    role: 'admin' 
  },
  { 
    name: 'Operator User', 
    email: 'operator@cyepro.com', 
    password: operatorHash, 
    role: 'operator' 
  }
]);

  // Create default rules
  await Rule.create([
    {
      name: 'Critical Security Alert',
      description: 'Always send security alerts immediately',
      priority: 100,
      conditions: [{ 
        field: 'event_type', 
        operator: 'contains', 
        value: 'security' 
      }],
      action: 'NOW'
    },
    {
      name: 'Marketing to NEVER',
      description: 'Drop all marketing notifications',
      priority: 90,
      conditions: [{ 
        field: 'event_type', 
        operator: 'contains', 
        value: 'marketing' 
      }],
      action: 'NEVER'
    },
    {
      name: 'Low Priority to LATER',
      description: 'Defer all low priority events',
      priority: 80,
      conditions: [{ 
        field: 'priority_hint', 
        operator: 'equals', 
        value: 'low' 
      }],
      action: 'LATER',
      defer_minutes: 120
    },
    {
      name: 'Critical Priority to NOW',
      description: 'Send all critical priority events immediately',
      priority: 95,
      conditions: [{ 
        field: 'priority_hint', 
        operator: 'equals', 
        value: 'critical' 
      }],
      action: 'NOW'
    }
  ]);
  console.log('✅ Rules created');

  // Create fatigue settings
  await FatigueSettings.create({
    key: 'global',
    max_notifications_per_hour: 10,
    max_notifications_per_day: 50,
    max_same_type_per_hour: 3,
    cooldown_minutes: 5
  });
  console.log('✅ Fatigue settings created');

  await mongoose.disconnect();
  console.log('✅ Seeding complete!');
  console.log('-------------------');
  console.log('Admin: admin@cyepro.com / Admin@123');
  console.log('Operator: operator@cyepro.com / Operator@123');
}

seed().catch(console.error);