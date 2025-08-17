const mongoose = require('mongoose');

// const optionSchema = new mongoose.Schema({
//     letter: {
//         type: String,
//         enum: ['A', 'B', 'C', 'D', 'E', 'F'] // Mở rộng để hỗ trợ tối đa 6 lựa chọn
//     },
//     text: {
//         type: String
//     }
// });

const questionSchema = new mongoose.Schema({
    number: {
        type: Number,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    image: {
        type: String
    },
    // options: {
    //     type: [optionSchema],
    //     validate: {
    //         validator: function(options) {
    //             return options && options.length >= 2 && options.length <= 6;
    //         },
    //         message: 'Each question must have between 2 and 6 options'
    //     },
    //     default: function() {
    //         return [
    //             { letter: 'A', text: '' },
    //             { letter: 'B', text: '' }
    //         ];
    //     }
    // },
    answer: {
        type: String,
    },
    // correctAnswer: {
    //     type: String, // Chỉ 1 đáp án đúng (single choice)
    //     required: true,
    //     enum: ['A', 'B', 'C', 'D', 'E', 'F']
    // },
    // answerTime: {
    //     type: Number, // Thời gian tính bằng giây
    //     default: 30,  // Mặc định 30 giây
    //     min: 5,       // Tối thiểu 5 giây
    //     max: 300      // Tối đa 5 phút (300 giây)
    // }
});

const surveySchema = new mongoose.Schema({
    // NEW: Auto-increment number field
    number: {
        type: Number,
        unique: true
        // Note: Removed 'required: true' to let pre-save middleware handle it
    },
    title: {
        type: String,
        required: true
    },
    // THÊM MỚI: Trường roomCode để phân biệt phòng ban
    roomCode: {
        type: String,
        required: true,
        enum: ['hrm', 'hse', 'gm', 'qaqs', 'sm', 'fol', 'eol', 'it', 'mkt', 'eng', 'wh', 'log', 'pnp', 'acc'],
        index: true // Tạo index để tìm kiếm nhanh hơn
    },
    scheduleSettings: {
        startTime: Date,
        endTime: Date
    },
    questions: [questionSchema],
    // Time is seconds for offline mode
    testDuration: {
        type: Number
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Thêm metadata để tính tổng thời gian survey
    metadata: {
        totalDuration: {
            type: Number, // Tổng thời gian của tất cả câu hỏi (giây)
            default: 0
        },
        version: {
            type: String,
            default: '2.0' // Version mới sau khi loại bỏ answer-type
        }
    }
}, {
    timestamps: true
});

// Function to get next survey number
async function getNextSurveyNumber() {
    try {
        // Try to find the highest survey number and increment
        const lastSurvey = await mongoose.model('Survey').findOne({}, {}, { sort: { 'number': -1 } });
        if (lastSurvey && lastSurvey.number) {
            return lastSurvey.number + 1;
        } else {
            return 1; // Start from 1 for survey numbers
        }
    } catch (error) {
        console.error('Error getting next survey number:', error);
        // Fallback to timestamp-based number
        return Date.now() % 1000000;
    }
}

// Pre-save middleware to auto-increment survey number
surveySchema.pre('save', async function(next) {
    if (this.isNew && !this.number) {
        try {
            this.number = await getNextSurveyNumber();
            console.log(`✅ Auto-generated survey number: ${this.number} for "${this.title}"`);
        } catch (error) {
            console.error('Error generating survey number:', error);
            // Fallback: use timestamp-based number
            this.number = Date.now() % 1000000;
            console.log(`⚠️ Using fallback survey number: ${this.number} for "${this.title}"`);
        }
    }
    next();
});

// Pre-save middleware để tính tổng thời gian
surveySchema.pre('save', function(next) {
    if (this.questions && this.questions.length > 0) {
        this.metadata.totalDuration = this.questions.reduce((total, question) => {
            // return total + (question.answerTime || 30);
            return 0;
        }, 0);
    }
    next();
});

// Index compound để tìm kiếm theo roomCode và các trường khác
surveySchema.index({ roomCode: 1, createdAt: -1 });
surveySchema.index({ roomCode: 1, mode: 1 });
surveySchema.index({ number: 1 }); // Index for survey number

module.exports = mongoose.model('Survey', surveySchema);