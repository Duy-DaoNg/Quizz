const mongoose = require('mongoose');
require('dotenv').config();
const AuthService = require('../services/auth.service');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Đã kết nối MongoDB Atlas thành công');
    const roomsResult = await AuthService.createInitialRooms();
    if (roomsResult.success) {
        console.log(`✅ Created ${roomsResult.createdCount} new rooms`);
    } else {
        console.error('❌ Failed to create rooms:', roomsResult.message);
    }
  } catch (err) {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
