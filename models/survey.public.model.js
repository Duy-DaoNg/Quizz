const mongoose = require('mongoose');

// Participant schema for test - UPDATED for offline mode
const participantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    socketId: {
        type: String,
        required: true
    },
    score: {
        type: Number,
        default: 0
    },
    answers: [{
        questionNumber: Number,
        // selectedAnswer: String,
        // isCorrect: Boolean,
        // answerTime: Number, // Time taken to answer in seconds
        // timeRemaining: Number, // Time remaining when answered
        // points: Number // Points earned for this question
        answer: String
    }],
    joinedAt: {
        type: Date,
        default: Date.now
    },
    // NEW: For offline mode - track completion
    completedAt: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
});

// Test session schema - UPDATED for offline mode
const publicSurveySchema = new mongoose.Schema({
    // Basic test info
    testCode: {
        type: String,
        unique: true,
        required: true,
        length: 6
    },
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Survey',
        required: true
    },
    quizNumber: {
        type: Number,
        required: true
    },
    roomCode: {
        type: String,
        required: true,
        enum: ['hrm', 'hse', 'gm', 'qaqs', 'sm', 'fol', 'eol', 'it', 'mkt', 'eng', 'wh']
    },
    
    // Test configuration
    // mode: {
    //     type: String,
    //     required: true,
    //     enum: ['online', 'offline']
    // },
    maxParticipants: {
        type: Number,
        required: true,
        min: 1,
        max: 1000
    },
    totalQuestions: {
        type: Number
    },
    // Schedule settings (for offline mode)
    scheduleSettings: {
        startTime: Date,
        endTime: Date
    },
    
    // Test state
    status: {
        type: String,
        enum: ['waiting', 'active', 'completed', 'cancelled'],
        default: function() {
            // NEW: Offline tests start as 'active', online tests start as 'waiting'
            return this.mode === 'offline' ? 'active' : 'waiting';
        }
    },
    // currentQuestion: {
    //     type: Number,
    //     default: 0
    // },
    // isQuestionActive: {
    //     type: Boolean,
    //     default: false
    // },
    // questionStartTime: Date,
    
    // Participants
    participants: [participantSchema],
    
    // Admin info (only for online mode)
    adminSocketId: String,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Results (saved after completion)
    // finalResults: [{
    //     rank: Number,
    //     name: String,
    //     score: Number,
    //     correctAnswers: Number,
    //     totalQuestions: Number,
    //     completionTime: Number
    // }],
    
    // NEW: Offline mode specific fields
    autoCompleteEnabled: {
        type: Boolean,
        default: function() {
            return this.mode === 'offline';
        }
    },
    
    // Concurrency control - version field for optimistic locking
    version: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    // Enable optimistic concurrency control
    optimisticConcurrency: true
});

// ========================================
// STATIC METHODS
// ========================================
publicSurveySchema.statics.checkNameAvailability = async function(testCode, participantName, participantId) {
    const objectId = new mongoose.Types.ObjectId(participantId);
    const publicSurvey = await this.findOne(
        { 
            testCode: testCode,
            'participants.name': participantName,
            'participants.isActive': true,
            'participants._id': objectId
        },
        { 'participants.$': 1 } // Project only matching participant
    );
    
    return {
        available: !publicSurvey,
        existingParticipant: publicSurvey ? publicSurvey.participants[0] : null
    };
};

// Generate unique 6-digit publicSurvey code
publicSurveySchema.statics.generateTestCode = async function() {
    let code;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
        // Generate 6-digit code
        code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Check if code already exists using atomic operation
        const existingTest = await this.findOne({ testCode: code }).select('_id');
        if (!existingTest) {
            isUnique = true;
        }
        attempts++;
    }
    
    if (!isUnique) {
        throw new Error('Failed to generate unique public survey code after multiple attempts');
    }
    
    return code;
};

// ========================================
// ATOMIC OPERATION HELPERS
// ========================================

// Atomic join participant - UPDATED for offline mode
publicSurveySchema.statics.getJoinParticipantQuery = function(testCode, participantName, socketId, mode = 'online') {
    const allowedStatuses = ['waiting', 'active'];
    
    return {
        filter: {
            testCode: testCode,
            status: { $in: allowedStatuses },
            $expr: { $lt: [{ $size: '$participants' }, '$maxParticipants'] },
            // line below is prevent participant join with same name
            // 'participants.name': { $ne: participantName }
        },
        update: {
            $push: {
                participants: {
                    name: participantName,
                    socketId: socketId,
                    score: 0,
                    answers: [],
                    joinedAt: new Date(),
                    isActive: true
                }
            }
        }
    };
};

// publicSurveySchema.methods.canCompleteParticipant = function(participantName) {
publicSurveySchema.methods.canCompleteParticipant = function(participantId) {
    
    const participant = this.participants.find(p => p._id.toString() === participantId);
    
    if (!participant) {
        return { canComplete: false, reason: 'Participant not found' };
    }
    
    if (!participant.isActive) {
        return { canComplete: false, reason: 'Participant is not active' };
    }
    
    if (participant.completedAt) {
        return { 
            canComplete: false, 
            reason: 'Participant already completed',
            completedAt: participant.completedAt 
        };
    }
    
    return { canComplete: true, participant };
};
// ========================================
// INSTANCE METHODS
// ========================================

// Method to get active participants
publicSurveySchema.methods.getActiveParticipants = function() {
    return this.participants.filter(p => p.isActive);
};

// NEW: Method to get completed participants (for offline mode)
publicSurveySchema.methods.getCompletedParticipants = function() {
    return this.participants.filter(p => p.isActive && p.completedAt);
};

// NEW: Method to get incomplete participants (for offline mode)
publicSurveySchema.methods.getIncompleteParticipants = function() {
    return this.participants.filter(p => p.isActive && !p.completedAt);
};

// Method to check if participant can join - UPDATED for offline mode
publicSurveySchema.methods.canJoin = function(participantName) {
    // For offline mode, allow joining if status is 'active'
    const allowedStatuses = this.mode === 'offline' ? ['waiting', 'active'] : ['waiting'];
    
    if (!allowedStatuses.includes(this.status)) {
        const statusMessage = this.mode === 'offline' ? 
            'Test is not available' : 
            'Test has already started';
        return { canJoin: false, reason: statusMessage };
    }
    
    if (this.participants.length >= this.maxParticipants) {
        return { canJoin: false, reason: 'Test is full' };
    }
    
    const nameExists = this.participants.some(p => p.name === participantName && p.isActive);
    if (nameExists) {
        return { canJoin: false, reason: 'Name already taken' };
    }
    
    return { canJoin: true };
};

// Method to check test availability for offline mode - UPDATED
publicSurveySchema.methods.isAvailable = function() {
    if (this.status === 'completed' || this.status === 'cancelled') {
        return { available: false, reason: 'Survey has ended' };
    }
    if (this.scheduleSettings) {
        const now = new Date();
        if (now < new Date(this.scheduleSettings.startTime)) {
            return { 
                available: false, 
                reason: 'Survey has not started yet',
                startTime: this.scheduleSettings.startTime 
            };
        }
        if (now > new Date(this.scheduleSettings.endTime)) {
            return { available: false, reason: 'Survey has expired' };
        }
    }
    
    // For offline mode, check if test is active
    if (this.status !== 'active') {
        return { available: false, reason: 'Survey is not available' };
    }
    
    return { available: true };
};

// NEW: Method to check if all participants completed (for offline mode)
publicSurveySchema.methods.isFullyCompleted = function() {
    const activeParticipants = this.getActiveParticipants();
    const completedParticipants = this.getCompletedParticipants();
    
    return activeParticipants.length > 0 && 
           completedParticipants.length === activeParticipants.length;
};

// NEW: Method to get completion progress (for offline mode)
publicSurveySchema.methods.getCompletionProgress = function() {    
    // Use simple filter instead of method calls for better performance
    const activeParticipants = this.participants.filter(p => p.isActive);
    const completedParticipants = activeParticipants.filter(p => p.completedAt);
    
    const result = {
        total: activeParticipants.length,
        completed: completedParticipants.length,
        percentage: activeParticipants.length > 0 ? 
            Math.round((completedParticipants.length / activeParticipants.length) * 100) : 0
    };
    
    // Cache result to avoid recalculation
    this._cachedProgress = result;
    this._progressCacheTime = Date.now();
    
    return result;
};

// ========================================
// VIRTUAL PROPERTIES
// ========================================

// Virtual for active participant count
publicSurveySchema.virtual('activeParticipantCount').get(function() {
    return this.participants.filter(p => p.isActive).length;
});

// Virtual for test progress - UPDATED for offline mode
publicSurveySchema.virtual('progress').get(function() {
    if (!this.quizId || !this.quizId.questions) return 0;
    // For offline mode, calculate average progress across all participants
    const activeParticipants = this.getActiveParticipants();
    if (activeParticipants.length === 0) return 0;
    
    const totalProgress = activeParticipants.reduce((sum, participant) => {
        const participantProgress = (participant.answers.length / this.quizId.questions.length) * 100;
        return sum + participantProgress;
    }, 0);
    
    return Math.round(totalProgress / activeParticipants.length);
});

// NEW: Virtual for completion status (offline mode)
publicSurveySchema.virtual('completionStatus').get(function() {
    
    const progress = this.getCompletionProgress();
    if (!progress) return 'unknown';
    
    if (progress.completed === 0) return 'in-progress';
    if (progress.completed === progress.total) return 'completed';
    return 'partial';
});

// ========================================
// MIDDLEWARE
// ========================================

// Pre-save middleware for validation - UPDATED for offline mode
publicSurveySchema.pre('save', function(next) {
    // Validate participant limit
    if (this.participants.length > this.maxParticipants) {
        return next(new Error('Too many participants'));
    }
    
    // Validate status transitions - UPDATED for offline mode
    if (this.isModified('status')) {
        const validTransitions = {
            waiting: ['active', 'cancelled'],
            active: ['completed', 'cancelled'],
            completed: [],
            cancelled: []
        };
        
        // For offline mode, allow direct transition to 'active'
        if (this.isNew) {
            // New offline tests can start as 'active'
            return next();
        }
        // Allow any transition on new documents
        if (!this.isNew) {
            // Skip validation - let service handle status changes
            console.log(`📝 Status change: ${this.status} for survey ${this.testCode}`);
        }
    }
    
    next();
});

// Pre-update middleware to handle version increment
publicSurveySchema.pre(['updateOne', 'findOneAndUpdate'], function() {
    // Auto-increment version for concurrency control
    if (!this.getUpdate().$inc) {
        this.getUpdate().$inc = {};
    }
    if (!this.getUpdate().$inc.version) {
        this.getUpdate().$inc.version = 1;
    }
});

// ========================================
// INDEXES FOR PERFORMANCE
// ========================================

// Primary indexes
publicSurveySchema.index({ testCode: 1 }, { unique: true });
publicSurveySchema.index({ status: 1 });
publicSurveySchema.index({ quizId: 1 });
publicSurveySchema.index({ roomCode: 1 });
publicSurveySchema.index({ createdAt: -1 });

// Compound indexes for complex queries
publicSurveySchema.index({ status: 1, createdAt: -1 });
publicSurveySchema.index({ roomCode: 1, status: 1 });
publicSurveySchema.index({ createdBy: 1, status: 1 });

// NEW: Index for offline mode schedule queries
publicSurveySchema.index({ 
    'scheduleSettings.startTime': 1, 
    'scheduleSettings.endTime': 1 
}, { sparse: true });

// // TTL index for automatic cleanup of old tests - UPDATED
// publicSurveySchema.index({ updatedAt: 1 }, { 
//     expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
//     partialFilterExpression: { 
//         status: { $in: ['completed', 'cancelled'] }
//     }
// });

// // NEW: TTL index for offline tests (shorter retention)
// publicSurveySchema.index({ completedAt: 1 }, {
//     expireAfterSeconds: 3 * 24 * 60 * 60, // 3 days for offline mode
//     partialFilterExpression: { 
//         mode: 'offline',
//         status: 'completed'
//     }
// });

// ========================================
// STATICS FOR BULK OPERATIONS
// ========================================

// Bulk cleanup inactive participants
publicSurveySchema.statics.cleanupInactiveParticipants = async function() {
    const result = await this.updateMany(
        { 
            status: { $in: ['waiting', 'active'] },
            'participants.isActive': false
        },
        {
            $pull: {
                participants: { isActive: false }
            }
        }
    );
    
    return result.modifiedCount;
};

// Bulk cancel expired offline tests - UPDATED
publicSurveySchema.statics.cancelExpiredTests = async function() {
    const now = new Date();
    const result = await this.updateMany(
        {
            mode: 'offline',
            status: { $in: ['waiting', 'active'] },
            'scheduleSettings.endTime': { $lt: now }
        },
        {
            $set: { status: 'cancelled' }
        }
    );
    
    return result.modifiedCount;
};

// ========================================
// ERROR HANDLING
// ========================================

// Handle unique constraint errors
publicSurveySchema.post('save', function(error, doc, next) {
    if (error.name === 'MongoError' && error.code === 11000) {
        if (error.keyPattern && error.keyPattern.testCode) {
            next(new Error('Survey code already exists'));
        } else {
            next(new Error('Duplicate key error'));
        }
    } else if (error.name === 'VersionError') {
        // Handle optimistic concurrency conflicts gracefully
        console.warn(`⚠️ Version conflict for survey ${doc?.testCode || 'unknown'}`);
        next(new Error('Document was modified by another process. Please retry.'));
    } else {
        next(error);
    }
});

// Handle version conflicts in updates
publicSurveySchema.post(['updateOne', 'findOneAndUpdate'], function(error, doc, next) {
    if (error.name === 'MongoError' && error.code === 16836) {
        next(new Error('Document was modified by another process. Please retry.'));
    } else if (error.name === 'VersionError') {
        next(new Error('Document version conflict. Please retry.'));
    } else {
        next(error);
    }
});
publicSurveySchema.statics.safeMarkParticipantCompleted = async function(testCode, participantId) {
    const completionTime = new Date();
    
    // Use more specific atomic operation
    const result = await this.findOneAndUpdate(
        {
            testCode: testCode,
            'participants': {
                $elemMatch: {
                    _id: mongoose.Types.ObjectId(participantId),
                    isActive: true,
                    completedAt: { $type: 'null' } // More explicit null check
                }
            }
        },
        {
            $set: {
                'participants.$.completedAt': completionTime
            },
            $inc: { version: 1 }
        },
        {
            new: true,
            maxTimeMS: 5000 // Add timeout to prevent hanging
        }
    );
    
    return result;
};
publicSurveySchema.methods.debugParticipantState = function(participantName) {
    const participant = this.participants.find(p => p._id.toString() === participantName);
    
    return {
        testCode: this.testCode,
        status: this.status,
        version: this.version,
        participant: participant ? {
            name: participant.name,
            isActive: participant.isActive,
            completedAt: participant.completedAt,
            hasCompletedAt: !!participant.completedAt,
            score: participant.score,
            answersCount: participant.answers.length
        } : null,
        totalParticipants: this.participants.length,
        activeParticipants: this.participants.filter(p => p.isActive).length,
        completedParticipants: this.participants.filter(p => p.isActive && p.completedAt).length
    };
};
// ========================================
// NEW: Check test completion status safely
// ========================================
publicSurveySchema.statics.checkAndCompleteTest = async function(testCode) {
    // Separate read and write operations to avoid conflicts
    const survey = await this.findOne({ testCode }).lean();
    
    if (!survey || survey.status !== 'active') {
        return false;
    }
    
    const activeParticipants = survey.participants.filter(p => p.isActive);
    const completedParticipants = activeParticipants.filter(p => p.completedAt);
    
    const allCompleted = activeParticipants.length > 0 && 
                        completedParticipants.length === activeParticipants.length;
    
    if (allCompleted) {
        const result = await this.updateOne(
            { 
                testCode: testCode,
                status: 'active' // Only update if still active
            },
            { 
                $set: { status: 'completed' },
                $inc: { version: 1 }
            }
        );
        
        return result.modifiedCount > 0;
    }
    
    return false;
};
// Method to calculate average score across all participants

// Method to get test completion statistics
publicSurveySchema.methods.getCompletionStats = function() {
    const activeParticipants = this.getActiveParticipants();
    const completedParticipants = this.getCompletedParticipants();
    
    return {
        total: activeParticipants.length,
        completed: completedParticipants.length,
        pending: activeParticipants.length - completedParticipants.length,
        completionRate: activeParticipants.length > 0 ? 
            Math.round((completedParticipants.length / activeParticipants.length) * 100) : 0
    };
};

// Virtual field for formatted completion date
publicSurveySchema.virtual('formattedCompletedAt').get(function() {
    if (!this.completedAt) return null;
    
    const date = new Date(this.completedAt);
    return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString(),
        relative: getRelativeTime(date)
    };
});

// Helper function for relative time formatting
function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
}
module.exports = mongoose.model('PublicSurvey', publicSurveySchema);