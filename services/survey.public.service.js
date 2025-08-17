const Survey = require('../models/survey.model');
const PublicSurvey = require('../models/survey.public.model');
const QRCode = require('qrcode');
const mongoose = require('mongoose');

class PublicSurveyService {
    /**
     * Create a new public survey session
     */
    async createPublicSurvey(testData, createdBy) {
        try {
            const { quizNumber, maxParticipants, scheduleSettings, roomCode } = testData;
            
            // Find quiz by number and room code
            const survey = await Survey.findOne({ 
                number: quizNumber, 
                roomCode: roomCode 
            });
            
            if (!survey) {
                throw new Error(`Survey #${quizNumber} not found in ${roomCode.toUpperCase()} department`);
            }
            // Validate scheduler
            if (!scheduleSettings || !scheduleSettings.startTime || !scheduleSettings.endTime) {
                throw new Error('Schedule settings are required for public survey.');
            }
            
            const startTime = new Date(scheduleSettings.startTime);
            const endTime = new Date(scheduleSettings.endTime);
            const now = new Date();
            
            if (startTime <= now) {
                throw new Error('Start time must be in the future');
            }
            
            if (endTime <= startTime) {
                throw new Error('End time must be after start time');
            }

            
            // Generate unique test code
            const testCode = await PublicSurvey.generateTestCode();
            
            // Create test - for offline mode, set initial status as 'active'
            const publicSurvey = new PublicSurvey({
                testCode,
                quizId: survey._id,
                quizNumber: survey.number,
                roomCode,
                totalQuestions: survey.questions.length,
                maxParticipants: Math.min(maxParticipants, 10000),
                scheduleSettings: scheduleSettings,
                status: 'active',
                createdBy,
                participants: []
            });
            
            await publicSurvey.save();
            
            console.log(`✅ Public survey created: ${testCode} for Survey #${survey.number}`);
            
            return {
                test: publicSurvey,
                quiz: survey,
                joinLink: this.generateJoinLink(testCode),
                qrCode: await this.generateQRCode(testCode)
            };
            
        } catch (error) {
            console.error('Create public survey error:', error);
            throw error;
        }
    }
    
    /**
     * Get public survey by code
     */
    async getPublicSurveyByCode(testCode) {
        try {
            const publicSurvey = await PublicSurvey.findOne({ testCode })
                .populate('quizId')
                .populate('createdBy', 'name email');
                
            if (!publicSurvey) {
                throw new Error('Public survey not found');
            }
            
            return publicSurvey;
        } catch (error) {
            console.error('Get public survey error:', error);
            throw error;
        }
    }
    
    /**
     * Join public survey as participant - FIXED validation for offline mode
     */
    async joinPublicSurvey(testCode, participantName, socketId) {
        try {
            const publicSurvey = await this.getPublicSurveyByCode(testCode);
            
            // FIXED: Validate test availability using comprehensive check
            const validation = await this.validateParticipantCanJoin(testCode, participantName);
            if (!validation.canJoin) {
                throw new Error(validation.reason);
            }
            
            // For offline mode, allow joining even when status is 'active'
            const allowedStatuses = ['waiting', 'active'];

            // If no inactive participant found, try to add new participant
            const addResult = await PublicSurvey.findOneAndUpdate(
                {
                    testCode: testCode,
                    status: { $in: allowedStatuses },
                    $expr: { $lt: [ { $size: { $filter: { input: '$participants', as: 'p', cond: '$$p.isActive' } } }, '$maxParticipants' ] }
                },
                {
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
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );

            
            if (!addResult) {
                // This should not happen if validation passed, but just in case
                throw new Error('Unable to join survey. Please try again.');
            }
            
            const participant = addResult.participants[addResult.participants.length - 1];
            
            return {
                test: publicSurvey,
                participant,
                waitingRoom: this.getWaitingRoomData(addResult)
            };
            
        } catch (error) {
            console.error('Join public survey error:', error);
            throw error;
        }
    }
    
    /**
     * UPDATED: Join offline public survey directly - Atomic operation
     */
    async joinOfflinePublicSurvey(testCode, participantName, participantId) {
        try {
            const objectId = new mongoose.Types.ObjectId(participantId);
            // Use new thread-safe name availability check
            const nameCheck = await PublicSurvey.checkNameAvailability(testCode, participantName, participantId);
            
            if (!nameCheck.available) {
                // Check if it's the same participant rejoining
                const existingParticipant = nameCheck.existingParticipant;
                if (existingParticipant.isActive) {
                    console.log(`🔄 Participant ${participantName} rejoining existing session`);
                    
                    const publicSurvey = await PublicSurvey.findOne({ testCode }).populate('quizId');
                    return {
                        test: publicSurvey,
                        participant: existingParticipant,
                        isReturning: true
                    };
                } else {
                    // Reactivate inactive participant
                    const reactivatedPublicSurvey = await PublicSurvey.findOneAndUpdate(
                        {
                            testCode: testCode,
                            'participants.name': participantName,
                            'participants.isActive': false,
                            'participants._id': objectId

                        },
                        {
                            $set: {
                                'participants.$.isActive': true,
                                'participants.$.joinedAt': new Date()
                            }
                        },
                        { new: true, populate: { path: 'quizId' } }
                    );
                    
                    if (reactivatedPublicSurvey) {
                        const participant = reactivatedPublicSurvey.participants.find(p => p._id.toString === participantId);
                        return {
                            test: reactivatedPublicSurvey,
                            participant,
                            isReturning: true
                        };
                    }
                }
            }
            
            // Add new participant using existing logic
            // const publicSurvey = await this.getPublicSurveyByCode(testCode);
            
            const validation = await this.validateParticipantCanJoin(testCode, participantName);
            if (!validation.canJoin) {
                throw new Error(validation.reason);
            }
            
            const newParticipant = {
                name: participantName,
                socketId: `offline_${Date.now()}_${Math.random()}`,
                score: 0,
                answers: [],
                joinedAt: new Date(),
                isActive: true
            };
            
            const updateResult = await PublicSurvey.findOneAndUpdate(
                {
                    testCode: testCode,
                    status: 'active',
                    $expr: { 
                        $lt: [
                            { $size: { $filter: { input: '$participants', as: 'p', cond: '$$p.isActive' } } }, 
                            '$maxParticipants'
                        ]
                    }
                },
                {
                    $push: { participants: newParticipant },
                    $inc: { version: 1 }
                },
                { 
                    new: true,
                    populate: { path: 'quizId' }
                }
            );
            
            if (!updateResult) {
                throw new Error('Cannot join public survey - survey full or not available');
            }
            
            const addedParticipant = updateResult.participants[updateResult.participants.length - 1];
            
            return {
                test: updateResult,
                participant: addedParticipant,
                isReturning: false
            };
            
        } catch (error) {
            console.error('Join public survey error:', error);
            throw error;
        }
    }
    /**
     * Get paginated list of tests with filtering
     * @param {Object} filterCriteria - MongoDB filter criteria
     * @param {Object} options - Pagination and sorting options
     * @returns {Array} List of tests
     */
    async getPublicSurveyList(filterCriteria = {}, options = {}) {
        try {
            const {
                skip = 0,
                limit = 10,
                sort = { updatedAt: -1 }
            } = options;

            const publicSurveys = await PublicSurvey.find(filterCriteria)
                .populate('quizId', 'title')
                .populate('createdBy', 'name email')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean();

            return publicSurveys;
        } catch (error) {
            console.error('Error fetching public surveys list:', error);
            throw new Error('Failed to fetch public surveys list');
        }
    }

    /**
     * Get total count of tests matching filter criteria
     * @param {Object} filterCriteria - MongoDB filter criteria
     * @returns {Number} Total count
     */
    async getPublicSurveysCount(filterCriteria = {}) {
        try {
            return await PublicSurvey.countDocuments(filterCriteria);
        } catch (error) {
            console.error('Error counting public surveys :', error);
            throw new Error('Failed to count public surveys ');
        }
    }
    
    /**
     * NEW: Complete offline test with answers - New method
     */
    async completePublicSurveyWithAnswers(testCode, participantName, timeRemaining, submittedAnswers, participantId) {
        const requestId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const objectId = new mongoose.Types.ObjectId(participantId);
        try {
            // Get test data
            const publicSurvey = await PublicSurvey.findOne({ testCode }).populate('quizId');
            
            if (!publicSurvey) {
                throw new Error('PublicSurvey not found');
            }
            
            // Check if participant can complete
            const canComplete = publicSurvey.canCompleteParticipant(participantId);
            if (!canComplete.canComplete) {
                if (canComplete.reason === 'Participant already completed') {
                    return true;
                }
                throw new Error(canComplete.reason);
            }

            console.log(`✅ [${requestId}] Processing completion for ${participantName}`);

            // Calculate final score and verify answers
            const survey = publicSurvey.quizId;
            let finalScore = 0;
            let correctAnswers = 0;

            // Update participant's answers and score atomically
            const updateResult = await PublicSurvey.findOneAndUpdate(
                {
                    testCode: testCode,
                    'participants': {
                        $elemMatch: {
                            name: participantName,
                            isActive: true,
                            completedAt: null,
                            _id: objectId
                        }
                    }
                },
                {
                    $set: {
                        'participants.$.answers': submittedAnswers,
                        'participants.$.completedAt': new Date()
                    },
                    $inc: { version: 1 }
                },
                { new: true }
            );

            if (!updateResult) {
                throw new Error('Failed to update participant completion status');
            }
            // Get updated participant
            const completedParticipant = updateResult.participants.find(p => p._id.toString() === participantId);

            return {
                participant: {
                    name: completedParticipant.name
                }
            };

        } catch (error) {
            console.error(`❌ [${requestId}] Complete offline test error:`, {
                testCode,
                participantName,
                error: error.message
            });
            throw error;
        }
    }
    /**
     * Helper method to update participant in final results
     */
    
    /**
     * UPDATED: Update final results in real-time - Now more efficient for single participant updates
     */
    
    /**
     * UPDATED: Update final results - Now includes both completed and in-progress participants for offline mode
     */
    
    /**
     * NEW: Get real-time ranking changes for offline test (useful for notifications)
     */
    
    /**
     * NEW: Demo method to show how the ranking system works
     */
    
    
    /**
     * Leave test - FIXED with atomic operation
     */
    
    /**
     * Start test (admin only) - FIXED with atomic operation
     */
    
    /**
     * Start question (admin only) - FIXED with atomic operation
     */
    
    /**
     * End question (admin only) - FIXED with atomic operation
     */
    
    /**
     * Submit answer (participant) - COMPLETELY FIXED with proper validation
     */
    
    /**
     * Complete test - FIXED with atomic operation
     */
    
    /**
     * Set admin socket ID - NEW atomic operation
     */
    
    /**
     * Helper method to calculate points
     */
    
    /**
     * Get test statistics for question
     */
    
    /**
     * Get waiting room data
     */
    
    /**
     * Generate join link
     */
    generateJoinLink(testCode) {
        const baseUrl = process.env.BASE_URL || 'http://112.213.87.91';
        return `${baseUrl}/publicsurvey/join/${testCode}`;
    }
    
    /**
     * Generate QR code
     */
    async generateQRCode(testCode) {
        try {
            const joinLink = this.generateJoinLink(testCode);
            const qrCodeDataURL = await QRCode.toDataURL(joinLink, {
                width: 200,
                margin: 2,
                color: {
                    dark: '#1f2937',
                    light: '#ffffff'
                }
            });
            return qrCodeDataURL;
        } catch (error) {
            console.error('QR code generation error:', error);
            return null;
        }
    }
    
    /**
     * Get test results - UPDATED for offline mode with atomic real-time support
     */
    async getPublicSurveyResults(testCode) {
        try {
            // For offline mode, allow viewing results even if not all participants completed
            // if (test.mode === 'online' && test.status !== 'completed') {
            //     throw new Error('Test is not completed yet');
            // }

            // ATOMIC: Get fresh test data and update final results if needed
            const freshPublicSurvey = await PublicSurvey.findOne({ testCode: testCode })
                .populate('quizId')
                .populate('createdBy', 'name email');
            
            return {
                testCode: freshPublicSurvey.testCode,
                quiz: {
                    title: freshPublicSurvey.quizId.title,
                    number: freshPublicSurvey.quizNumber
                },
                totalQuestions: freshPublicSurvey.totalQuestions,
                status: freshPublicSurvey.status,
                completedAt: freshPublicSurvey.status === 'completed' ? freshPublicSurvey.updatedAt : null,
                participantCount: freshPublicSurvey.participants.filter(p => p.isActive).length,
            };
        } catch (error) {
            console.error('Get public survey results error:', error);
            throw error;
        }
    }

    /**
     * Validate participant can join test - FIXED for offline mode
     */
    async validateParticipantCanJoin(testCode, participantName) {
        try {
            const publicSurvey = await this.getPublicSurveyByCode(testCode);
            const trimmedName = participantName.trim();
            
            // Basic validations
            if (!trimmedName || trimmedName.length < 2) {
                return {
                    canJoin: false,
                    reason: 'Name must be at least 2 characters long'
                };
            }
            
            if (trimmedName.length > 50) {
                return {
                    canJoin: false,
                    reason: 'Name is too long (maximum 50 characters)'
                };
            }
            
            // FIXED: Schedule check FIRST for offline mode (most important)
            if (publicSurvey.scheduleSettings) {
                const now = new Date();
                if (now < new Date(publicSurvey.scheduleSettings.startTime)) {
                    return {
                        canJoin: false,
                        reason: 'Survey has not started yet. Please wait for the scheduled start time.',
                        errorType: 'NOT_STARTED',
                        startTime: publicSurvey.scheduleSettings.startTime
                    };
                }
                if (now > new Date(publicSurvey.scheduleSettings.endTime)) {
                    return {
                        canJoin: false,
                        reason: 'Survey has expired and is no longer available.',
                        errorType: 'EXPIRED'
                    };
                }
            }
            // Offline mode: allow joining if status is 'active' (this is normal for offline)
            if (publicSurvey.status !== 'active') {
                return {
                    canJoin: false,
                    reason: 'Survey is not currently available',
                    errorType: 'NOT_AVAILABLE'
                };
            }
            
            // Capacity check
            const activeParticipants = publicSurvey.getActiveParticipants();
            if (activeParticipants.length >= publicSurvey.maxParticipants) {
                return {
                    canJoin: false,
                    reason: 'Survey is full. No more participants can join.',
                    errorType: 'FULL'
                };
            }
            
            // Name uniqueness check
            // const nameCheck = await this.checkParticipantNameUniqueness(testCode, participantName);
            // if (!nameCheck.isUnique) {
            //     return {
            //         canJoin: false,
            //         reason: 'This name is already taken by another participant. Please choose a different name.',
            //         errorType: 'NAME_TAKEN'
            //     };
            // }
            
            // All validations passed
            return {
                canJoin: true,
                test: {
                    testCode: publicSurvey.testCode,
                    title: publicSurvey.quizId.title,
                    status: publicSurvey.status,
                    participantCount: activeParticipants.length,
                    maxParticipants: publicSurvey.maxParticipants,
                    availableSlots: publicSurvey.maxParticipants - activeParticipants.length,
                    scheduleSettings: publicSurvey.scheduleSettings
                },
                participant: {
                    name: trimmedName,
                    canJoin: true
                }
            };
            
        } catch (error) {
            console.error('Validate participant can join error:', error);
            return {
                canJoin: false,
                reason: 'Survey not found or validation failed',
                errorType: 'VALIDATION_ERROR'
            };
        }
    }
}

module.exports = new PublicSurveyService();