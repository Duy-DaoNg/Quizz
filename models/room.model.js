const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        enum: ['hrm', 'hse', 'gm', 'qaqs', 'sm', 'fol', 'eol', 'it', 'mkt', 'eng', 'wh', 'log', 'pnp', 'acc']
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

roomSchema.statics.findByCode = function(code) {
    return this.findOne({ code: code.toLowerCase() });
};

roomSchema.statics.validatePassword = async function(code, password) {
    const room = await this.findOne({ code: code.toLowerCase() });
    if (!room) return false;
    return room.password === password;
};

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;