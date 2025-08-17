const PublicSurveyService = require('../services/survey.public.service');
const SurveyService = require('../services/survey.service');

class PublicSurveyController {
    /**
     * Create new test session
     */
    async createPublicSurvey(req, res) {
        try {
            const { quizNumber, maxParticipants, scheduleSettings } = req.body;
            const roomCode = req.session?.selectedRoom?.code;
            const createdBy = req.session.user.id;
            
            if (!roomCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Room selection required'
                });
            }
            
            // Validate input
            if (!quizNumber || !maxParticipants) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }
            
            if (maxParticipants < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Max participants must be between 1 and 10000'
                });
            }
            
            const testData = {
                quizNumber: parseInt(quizNumber),
                maxParticipants: parseInt(maxParticipants),
                scheduleSettings,
                roomCode
            };
            
            const result = await PublicSurveyService.createPublicSurvey(testData, createdBy);
            
            res.json({
                success: true,
                message: 'Public survey created successfully',
                test: {
                    testCode: result.test.testCode,
                    quizTitle: result.quiz.title,
                    quizNumber: result.quiz.number,
                    maxParticipants: result.test.maxParticipants,
                    scheduleSettings: result.test.scheduleSettings
                },
                joinLink: result.joinLink,
                qrCode: result.qrCode
            });
            
        } catch (error) {
            console.error('Create test error:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
    
    /**
     * Join test page
     */
    async renderJoinPage(req, res) {
        try {
            const { testCode } = req.params;
            
            if (!testCode || testCode.length !== 6) {
                return res.status(404).render('error/404', {
                    title: req.t ? req.t('error:test_not_found') : 'Test Not Found',
                    message: req.t ? req.t('publicsurvey:invalid_publicsurvey_code') : 'Invalid test code',
                    lng: req.language || 'vi',
                    layout: false
                });
            }
            
            const publicSurvey = await PublicSurveyService.getPublicSurveyByCode(testCode);
            
            // Check if test is accessible

            const now = new Date();
            if (publicSurvey.scheduleSettings) {
                if (now < new Date(publicSurvey.scheduleSettings.startTime)) {
                    return res.render('test/not_started', {
                        title: req.t ? req.t('publicsurvey:publicsurvey_not_started') : 'Survey Not Started',
                        test: publicSurvey,
                        startTime: publicSurvey.scheduleSettings.startTime,
                        lng: req.language || 'vi',
                        t: req.t,
                        layout: false
                    });
                }
                if (now > new Date(publicSurvey.scheduleSettings.endTime)) {
                    return res.render('test/expired', {
                        title: req.t ? req.t('publicsurvey:publicsurvey_ended') : 'Survey Ended',
                        test: publicSurvey,
                        lng: req.language || 'vi',
                        t: req.t,
                        layout: false
                    });
                }
            }

            
            if (publicSurvey.status === 'completed') {
                return res.render('test/completed', {
                    title: req.t ? req.t('publicsurvey:publicsurvey_completed') : 'Survey Completed',
                    test: publicSurvey,
                    lng: req.language || 'vi',
                    t: req.t,
                    layout: false
                });
            }
            
            res.render('survey/join', {
                title: `${req.t ? req.t('publicsurvey:join_publicsurvey') : 'Join Survey'} ${testCode}`,
                test: publicSurvey,
                error: req.session.testError || null, // Pass error message if any
                lng: req.language || 'vi',
                // i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                layout: false
            });
            
            // Clear error message after displaying
            if (req.session.testError) {
                delete req.session.testError;
            }
            
        } catch (error) {
            console.error('Join page error:', error);
            res.status(404).render('error/404', {
                title: req.t ? req.t('error:test_not_found') : 'Survey Not Found',
                message: req.t ? req.t('publicSurvey:publicSurvey_not_found') : 'The survey you are looking for does not exist',
                lng: req.language || 'vi',
                layout: false
            });
        }
    }
    
    /**
     * Test room (for both admin and participants) - FIXED for offline mode with participant join
     */
    async renderSurveyRoom(req, res) {
        try {
            const { testCode } = req.params;
            const isAdmin = req.query.admin === 'true';
            
            if (!testCode || testCode.length !== 6) {
                return res.status(404).render('error/404', {
                    title: req.t ? req.t('error:test_not_found') : 'Survey Not Found',
                    lng: req.language || 'vi',
                    layout: false
                });
            }
            
            const publicSurvey = await PublicSurveyService.getPublicSurveyByCode(testCode);
            
            // FIXED: For offline mode, join participant first then render
            if (!isAdmin) {
                // Check if participant has valid session
                const testSession = req.session?.testSession;
                if (!testSession || testSession.testCode !== testCode || !testSession.participantName) {
                    return res.redirect(`/survey/join/${testCode}`);
                }
                
                try {
                    // FIXED: Actually join the participant to the test before rendering
                    const joinResult = await PublicSurveyService.joinOfflinePublicSurvey(testCode, testSession.participantName, testSession.participantId);
                    req.session.testSession.participantId = joinResult.participant._id.toString();
                    console.log(`✅ Survey participant "${testSession.participantName}" joined survey ${testCode}`);
                    
                    
                    // Render survey with participant data
                    return res.render('survey/public_survey', {
                        title: `${publicSurvey.quizId.title} - ${testCode}`,
                        test: joinResult.test,
                        quiz: joinResult.test.quizId,
                        participantName: testSession.participantName,
                        participantId: joinResult.participant._id.toString(),
                        participant: joinResult.participant,
                        isOfflineMode: true,
                        lng: req.language || 'vi',
                        // i18n helpers
                        t: req.t,
                        ti: res.locals.ti,
                        formatDate: res.locals.formatDate,
                        formatNumber: res.locals.formatNumber,
                        layout: false
                    });
                    
                } catch (joinError) {
                    console.error('Failed to join public survey:', joinError);
                    
                    // If join fails, redirect back to join page with error
                    req.session.testError = joinError.message;
                    return res.redirect(`/survey/join/${testCode}`);
                }
            }
            
        } catch (error) {
            console.error('Survey room error:', error);
            res.status(404).render('error/404', {
                title: req.t ? req.t('error:test_not_found') : 'Survey Not Found',
                lng: req.language || 'vi',
                layout: false
            });
        }
    }
    
    /**
     * Join test by code (for quiz list page)
     */
    async renderJoinByCode(req, res) {
        try {
            res.render('survey/join_by_code', {
                title: req.t ? req.t('survey:join_by_code') : 'Join Survey by Code',
                user: req.session.user || null,
                lng: req.language || 'vi',
                // i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                layout: false
            });
        } catch (error) {
            console.error('Join by code error:', error);
            res.status(500).render('error/500', {
                title: req.t ? req.t('error:server_error') : 'Server Error',
                lng: req.language || 'vi',
                layout: false
            });
        }
    }
    
    /**
     * Validate test code and redirect - UPDATED for offline mode
     */
    async validateAndJoinPublicSurvey(req, res) {
        try {
            const { testCode } = req.body;
            
            if (!testCode || testCode.length !== 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid 6-digit survey code'
                });
            }
            
            // Check if test exists
            const test = await TestService.getTestByCode(testCode);
            
            res.json({
                success: true,
                message: 'Survey found',
                redirectUrl: `/survey/join/${testCode}`
            });
            
        } catch (error) {
            console.error('Validate survey code error:', error);
            res.status(404).json({
                success: false,
                message: 'Survey not found. Please check your code and try again.'
            });
        }
    }
    
    /**
     * Validate test availability - UPDATED for offline mode
     */
    async validatePublicSurveyAvailability(req, res) {
        try {
            const { testCode, participantName } = req.body;
            
            // Basic input validation
            if (!testCode || testCode.length !== 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid 6-digit survey code'
                });
            }
            
            if (!participantName) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter your name'
                });
            }
            
            // Use PublicSurveyService helper for comprehensive validation
            const validation = await PublicSurveyService.validateParticipantCanJoin(testCode, participantName);
            
            if (!validation.canJoin) {
                return res.status(400).json({
                    success: false,
                    message: validation.reason,
                    errorType: validation.errorType || 'VALIDATION_ERROR',
                    startTime: validation.startTime // For scheduled tests
                });
            }
            
            // NEW: Store participant session for offline mode
            req.session.testSession = {
                testCode: testCode,
                participantName: participantName.trim(),
                validated: true,
                timestamp: Date.now()
            };
            
            // All validations passed
            res.json({
                success: true,
                message: 'Validation successful - ready to join test',
                test: validation.test,
                participant: validation.participant
            });
            
        } catch (error) {
            console.error('Validate survey availability error:', error);
            res.status(404).json({
                success: false,
                message: 'Survey not found. Please check your code and try again.',
                errorType: 'TEST_NOT_FOUND'
            });
        }
    }
    
    /**
     * Complete offline survey with answers - New method
     */
    async completePublicSurveyWithAnswers(req, res) {
        try {
            const { testCode, participantName, timeRemaining, answers } = req.body;

            let participantId = req.session.testSession.participantId;

            if (!participantId) {
                res.status(400).json({
                    success: false,
                    message: "Missing Participant ID"
                });
                return;
            }

            if (!testCode || !participantName || !Array.isArray(answers) || !participantId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields'
                });
            }
            
            // Validate session (optional but recommended)
            const testSession = req.session?.testSession;
            if (testSession && (testSession.testCode !== testCode || testSession.participantName !== participantName || testSession.participantId !== participantId)) {
                console.warn(`Session mismatch for ${participantName} in survey ${testCode}`);
            }
            
            const result = await PublicSurveyService.completePublicSurveyWithAnswers(
                testCode,
                participantName,
                timeRemaining,
                answers,
                participantId
            );
            
            // Clear session after completion
            if (req.session?.testSession) {
                delete req.session.testSession;
            }
            
            res.json({
                success: true,
                message: 'Survey completed successfully',
                results: result
            });
            
        } catch (error) {
            console.error('Complete survey error:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
    
    /**
     * Get test results
     */
    async getPublicSurveyResults(req, res) {
        try {
            const { testCode } = req.params;
            const results = await PublicSurveyService.getPublicSurveyResults(testCode);
            
            res.json({
                success: true,
                results: results
            });
            
        } catch (error) {
            console.error('Get public survey results error:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
    
    /**
     * Render test results page
     */
    // async renderTestResults(req, res) {
    //     try {
    //         const { testCode } = req.params;
    //         const results = await PublicSurveyService.getTestResults(testCode);
            
    //         res.render('test/results', {
    //             title: `${req.t ? req.t('test:test_results') : 'Test Results'} - ${testCode}`,
    //             results: results,
    //             lng: req.language || 'vi',
    //             // i18n helpers
    //             t: req.t,
    //             ti: res.locals.ti,
    //             formatDate: res.locals.formatDate,
    //             formatNumber: res.locals.formatNumber,
    //             layout: false
    //         });
            
    //     } catch (error) {
    //         console.error('Render test results error:', error);
    //         res.status(404).render('error/404', {
    //             title: req.t ? req.t('error:test_not_found') : 'Results Not Found',
    //             message: req.t ? req.t('test:test_not_found') : 'Test results not found or test is not completed yet',
    //             lng: req.language || 'vi',
    //             layout: false
    //         });
    //     }
    // }
    /**
     * Render test results list page (admin only)
     */
    async renderPublicSurveyResultsList(req, res) {
        try {
            const { getCurrentRoomInfo } = require('./auth.controller');
            const roomInfo = getCurrentRoomInfo(req);
            
            if (!roomInfo) {
                return res.redirect('/auth/admin/select-room');
            }

            // Get query parameters for filtering and pagination
            const page = parseInt(req.query.page) || 1;
            const limit = 10; // Fixed at 10 records per page
            const mode = 'all'; // 'all', 'online', 'offline'
            const skip = (page - 1) * limit;

            // Build filter criteria
            const filterCriteria = {
                roomCode: roomInfo.code
            };

            // Get tests with pagination
            const publicSurveys = await PublicSurveyService.getPublicSurveyList(filterCriteria, {
                skip,
                limit,
                sort: { updatedAt: -1 } // Most recent first
            });

            // Get total count for pagination
            const totalPublicSurveys = await PublicSurveyService.getPublicSurveysCount(filterCriteria);
            const totalPages = Math.ceil(totalPublicSurveys / limit);

            // Format test data for display
            const formattedPublicSurveys = publicSurveys.map(survey => ({
                id: survey._id,
                testCode: survey.testCode,
                quizTitle: survey.quizId ? survey.quizId.title : 'Unknown Quiz',
                createdAt: survey.createdAt,
                participantCount: survey.participants ? survey.participants.length : 0,
                totalParticipants: survey.participants ? survey.participants.length : 0
            }));

            // Statistics for header
            const stats = {
                total: totalPublicSurveys
            };

            res.render('survey/results-list', {
                title: `${req.t ? req.t('survey:survey_results') : 'Survey Results'} - ${roomInfo.name} ${req.t ? req.t('quiz:department') : 'Department'}`,
                user: req.user,
                tests: formattedPublicSurveys,
                stats,
                currentPage: page,
                totalPages,
                totalTests:totalPublicSurveys,
                mode,
                roomInfo,
                lng: req.language || 'vi',
                // i18n helpers
                t: req.t,
                ti: res.locals.ti,
                formatDate: res.locals.formatDate,
                formatNumber: res.locals.formatNumber,
                pagination: {
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    nextPage: page + 1,
                    prevPage: page - 1,
                    pages: Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const startPage = Math.max(1, page - 2);
                        return startPage + i;
                    }).filter(p => p <= totalPages)
                },
                layout: false
            });

        } catch (error) {
            console.error('Survey results list error:', error);
            res.status(500).render('error/500', {
                title: req.t ? req.t('error:server_error') : 'Server Error',
                message: req.t ? req.t('error:server_error_desc') : 'Unable to load survey results',
                user: req.user,
                lng: req.language || 'vi'
            });
        }
    }

    
    /**
     * API endpoint to get live test data
     */
    async getPublicSurveyData(req, res) {
        try {
            const { testCode } = req.params;
            const survey = await PublicSurveyService.getPublicSurveyByCode(testCode);
            
            res.json({
                success: true,
                test: {
                    testCode: survey.testCode,
                    status: survey.status,
                    currentQuestion: survey.currentQuestion,
                    isQuestionActive: survey.isQuestionActive,
                    participantCount: survey.getActiveParticipants().length,
                    maxParticipants: survey.maxParticipants
                }
            });
            
        } catch (error) {
            console.error('Get test data error:', error);
            res.status(404).json({
                success: false,
                message: 'Survey not found'
            });
        }
    }
}

module.exports = new PublicSurveyController();